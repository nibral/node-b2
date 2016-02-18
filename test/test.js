'use strict';

// 引数からテスト対象のAPI名を取り出す
if (process.argv.length < 3) {
    console.log('usage: node test.js target_api_operation');
    process.exit(1);
}
const target = process.argv[2];

// B2インスタンス生成
const config = require('./config.json');
const B2 = require('../B2');
const b2app = new B2(config.AccountID, config.ApplicationKey);

if (target === 'b2_authorize_account') {
    // テスト対象がb2_authorize_accountの場合は認証結果を表示して終了
    b2app.authorizeAccount().then((result) => {
        console.log(result);
    }).catch((error) => {
        console.log(error);
    });
} else {
    // b2_authorize_account以外のAPIは認証が必要
    b2app.authorizeAccount().then((result) => {
        // 認証成功
        // API名を元にテスト実行
        switch (target) {

            case 'b2_create_bucket':
                if (process.argv.length < 4) {
                    console.log('usage: node test.js b2_create_bucket bucketName [private]');
                    process.exit(1);
                }
                const newBucketName = process.argv[3];
                const isNewBucketPrivate = (process.argv[4] && process.argv[4] === 'private') ? true : false;

                b2app.createBucket(newBucketName, isNewBucketPrivate).then((result) => {
                    console.log(result);
                }).catch((error) => {
                    console.log(error);
                });
                break;

            case 'b2_delete_bucket':
                if (process.argv.length < 4) {
                    console.log('usage: node test.js b2_delete_bucket bucketID');
                    process.exit(1);
                }
                const deleteBucketID = process.argv[3];

                b2app.deleteBucket(deleteBucketID).then((result) => {
                    console.log(result);
                }).catch((error) => {
                    console.log(error);
                });
                break;

            case 'b2_get_upload_url':
                if (process.argv.length < 4) {
                    console.log('usage: node test.js b2_get_upload_url bucketID');
                    process.exit(1);
                }
                const uploadBucketID = process.argv[3];

                b2app.getUploadUrl(uploadBucketID).then((result) => {
                    console.log(result);
                }).catch((error) => {
                    console.log(error);
                });
                break;

            case 'b2_list_buckets':
                b2app.listBucket().then((result) => {
                    result.buckets.forEach((bucket) => {
                        console.log(bucket);
                    });
                }).catch((error) => {
                    console.log(error);
                });
                break;

            case 'b2_update_bucket':
                if (process.argv.length < 5) {
                    console.log('usage: node test.js b2_update_bucket bucketID public|private');
                    process.exit(1);
                }
                const updateBucketID = process.argv[3];
                let isUpdateBucketPrivate = true;
                switch (process.argv[4]) {
                    case 'public':
                        isUpdateBucketPrivate = false;
                        break;
                    case 'private':
                        isUpdateBucketPrivate = true;
                        break;
                    default:
                        console.log('Unknown bucketType "%s". Use either "public" or "private".', process.argv[4]);
                        process.exit(1);
                }

                b2app.updateBucket(updateBucketID, isUpdateBucketPrivate).then((result) => {
                    console.log(result);
                }).catch((error) => {
                    console.log(error);
                });
                break;

            // 該当APIの実装なし
            default:
                console.log('Operation "%s" is not implemented.', target);
                break;
        }
    }).catch((error) => {
        // 認証失敗
        console.log(error);
    });
}
