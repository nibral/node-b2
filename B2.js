'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('request-promise');

class B2 {
    /*
        インスタンス生成時にアカウント情報を記録する
    */
    constructor(accountID, applicationKey) {
        this.accountID = accountID;
        this.applicationKey = applicationKey;
        this.authorizationInfo = {};
    }

    /*
        有効な認証トークンがあるか確認する
        
        a. 認証トークンが有効期限内なら、記録されている認証情報を返す
        b. 認証トークンの有効期限を過ぎていたら、認証を試みる
            b-1. 認証に成功した場合、取得した認証情報を返す
            b-2. 認証に失敗した場合、エラーを返す
        c. 1度も認証が行われていない場合、エラーを返す
            -> 1回目の認証は、authorizeAccount()を明示的に呼び出す必要がある
    */
    confirmAuthorizationToken() {
        return new Promise((resolve, reject) => {
            if (!this.authorizationInfo.authorizationTokenExpireDate) {
                reject('authorizationTokenExpireDate is Undefined.');
                return;
            }

            const now = new Date();
            if (now.getTime() < this.authorizationInfo.authorizationTokenExpireDate) {
                resolve(this.authorizationInfo);
            } else {
                this.authorizeAccount().then((response) => {
                    resolve(response);
                }).catch((error) => {
                    reject(error);
                });;
            }
        });
    }

    /*
        fs.statsをPromise化する
    */
    stats(filePath) {
        return new Promise((resolve, reject) => {
            fs.stat(filePath, (error, stats) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stats);
            });
        });
    }

    /*
        指定されたファイルのSHA-1ハッシュ値を計算する
    */
    calculateSHA1Hash(filePath) {
        return new Promise((resolve, reject) => {
            const sha1hash = crypto.createHash('sha1');
            const fileStream = fs.createReadStream(filePath);

            fileStream.on('error', (error) => {
                reject(error);
            });
            fileStream.on('data', (data) => {
                sha1hash.update(data);
            });
            fileStream.on('end', () => {
                resolve({ sha1hash: sha1hash });
            });
        });
    }

    /*
        アカウントを認証する
        
        認証に成功した場合、authorizationInfoに
            1. 認証トークン(authorizationToken)
            2. 認証トークンの有効期限(authorizationTokenExpired)
            3. APIの起点となるURL(apiUrl)
            4. ファイルダウンロードの起点となるURL(downloadUrl)
        を記録する。
        認証に失敗した場合、authorizationTokenExpiredに現時刻をセットする。
        
        https://www.backblaze.com/b2/docs/b2_authorize_account.html
    */
    authorizeAccount() {
        return new Promise((resolve, reject) => {
            const options = {
                uri: 'https://api.backblaze.com/b2api/v1/b2_authorize_account',
                auth: {
                    user: this.accountID,
                    pass: this.applicationKey,
                },
                json: true
            };

            request(options).then((response) => {
                this.authorizationInfo = response;
            
                // 認証トークンの有効期間は24時間
                const now = new Date();
                this.authorizationInfo.authorizationTokenExpireDate = now.setHours(now.getHours() + 24);

                resolve(this.authorizationInfo);
            }).catch((error) => {
                this.authorizationTokenExpireDate = new Date();
                reject(error);
            });
        });
    }
        
    /*
        指定した名前でバケットを作成する
        
        bucketNameの制約
            6文字以上50文字以下の一意なものでなければならない
            利用できる文字は英数字とハイフンのみ
            「b2-」で始まる名前は利用できない

        bucketTypeは以下のいずれか
            allPublic: 誰でもファイルをダウンロードできる
            allPrivate: 認証トークンを持つユーザのみファイルをダウンロードできる

        https://www.backblaze.com/b2/docs/b2_create_bucket.html 
    */
    createBucket(bucketName, isPrivateBucket) {
        return new Promise((resolve, reject) => {
            this.confirmAuthorizationToken().then((authInfo) => {
                // TODO: bucketNameのValidation

                const options = {
                    method: 'POST',
                    uri: authInfo.apiUrl + '/b2api/v1/b2_create_bucket',
                    headers: {
                        Authorization: authInfo.authorizationToken
                    },
                    body: {
                        accountId: this.accountID,
                        bucketName: bucketName,
                        bucketType: isPrivateBucket ? 'allPrivate' : 'allPublic'
                    },
                    json: true
                };

                return request(options);
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /*
        指定したIDのバケットを削除する
        
        https://www.backblaze.com/b2/docs/b2_delete_bucket.html
    */
    deleteBucket(bucketID) {
        return new Promise((resolve, reject) => {
            this.confirmAuthorizationToken().then((authInfo) => {
                const options = {
                    method: 'POST',
                    uri: authInfo.apiUrl + '/b2api/v1/b2_delete_bucket',
                    headers: {
                        Authorization: authInfo.authorizationToken
                    },
                    body: {
                        accountId: this.accountID,
                        bucketId: bucketID
                    },
                    json: true
                };

                return request(options);
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /*
        指定したIDのバケットにファイルをアップロードするためのURLを取得する
        
        https://www.backblaze.com/b2/docs/b2_get_upload_url.html
    */
    getUploadUrl(bucketID) {
        return new Promise((resolve, reject) => {
            this.confirmAuthorizationToken().then((authInfo) => {
                const options = {
                    method: 'POST',
                    uri: authInfo.apiUrl + '/b2api/v1/b2_get_upload_url',
                    headers: {
                        Authorization: authInfo.authorizationToken
                    },
                    body: {
                        bucketId: bucketID,
                    },
                    json: true
                };

                return request(options);
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /*
        バケットの一覧を取得する
        
        https://www.backblaze.com/b2/docs/b2_list_buckets.html
    */
    listBucket() {
        return new Promise((resolve, reject) => {
            this.confirmAuthorizationToken().then((authInfo) => {
                const options = {
                    method: 'POST',
                    uri: authInfo.apiUrl + '/b2api/v1/b2_list_buckets',
                    headers: {
                        Authorization: authInfo.authorizationToken
                    },
                    body: {
                        accountId: this.accountID,
                    },
                    json: true
                };

                return request(options);
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /*
        指定したIDのバケットの設定を更新する
        
        できること
        ・bucketType(allPublic|allPrivate)の切り替え
        
        https://www.backblaze.com/b2/docs/b2_update_bucket.html
    */
    updateBucket(bucketID, isPrivateBucket) {
        return new Promise((resolve, reject) => {
            this.confirmAuthorizationToken().then((authInfo) => {
                const options = {
                    method: 'POST',
                    uri: authInfo.apiUrl + '/b2api/v1/b2_update_bucket',
                    headers: {
                        Authorization: authInfo.authorizationToken
                    },
                    body: {
                        accountId: this.accountID,
                        bucketId: bucketID,
                        bucketType: isPrivateBucket ? 'allPrivate' : 'allPublic'
                    },
                    json: true
                };
                return request(options);
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /*
        指定したIDのバケットにファイルをアップロードする
     
        https://www.backblaze.com/b2/docs/b2_upload_file.html
    */
    uploadFile(bucketID, uploadFilePath) {
        return new Promise((resolve, reject) => {
            const uploadFilename = path.basename(uploadFilePath);
            let uploadFileSize = 0;
            let uploadFileHash = '';

            // アップロードするファイルのファイルサイズを計算
            this.stats(uploadFilePath).then((stats) => {
                uploadFileSize = stats.size;

                // アップロードするファイルのSHA-1ハッシュ値を計算
                return this.calculateSHA1Hash(uploadFilePath);
            }).then((calcResult) => {
                uploadFileHash = calcResult.sha1hash.digest('hex');

                // 認証情報確認
                return this.confirmAuthorizationToken();
            }).then((authInfo) => {

                // アップロード用URL取得
                return this.getUploadUrl(bucketID);
            }).then((response) => {

                // uriと認証トークンはgetUploadUrlで取得したものを使う
                const options = {
                    method: 'POST',
                    uri: response.uploadUrl,
                    headers: {
                        Authorization: response.authorizationToken,
                        'X-Bz-File-Name': encodeURIComponent(uploadFilename),
                        'Content-Type': 'b2/x-auto',
                        'Content-Length': uploadFileSize,
                        'X-Bz-Content-Sha1': uploadFileHash
                    },
                    json: true
                };

                // ファイルの中身をrequestに流し込む
                return fs.createReadStream(uploadFilePath).pipe(request(options));
            }).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        });
    }
}

module.exports = B2;
