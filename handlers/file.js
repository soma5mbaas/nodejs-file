var FileSchema = require('haru-nodejs-util').models.File.schema;
var exportSchemaToJson = require('haru-nodejs-util').common.exportSchemaToJson;
var store = require('haru-nodejs-store');
var keys = require('haru-nodejs-util').keys;


var FileClassName = 'Files';

var AWS = require('aws-sdk');
var _ = require('underscore');
var async = require('async');
var uuid = require('uuid');

var maxFileSize = require('../config').limits.fileSize;

var pngquant = require('node-pngquant-native');


AWS.config.loadFromPath(__dirname+'/aws.json');

var s3 = new AWS.S3();

exports.uploadS3 = function(header, files, callback) {
    if( !_.isObject(files) ) { return callback(new Error('file'), null); }
    var fields = Object.keys(files);
    var applicationId = header.applicationId;

    async.times(fields.length, function(n, next) {
        var file = files[fields[n]];

        if( file.size === maxFileSize ) {
            return next(null, {});
        }

        if( file.mimetype === 'image/png' ) {
            file.buffer = pngquant.compress(file.buffer, {
                "speed": 1 //1 ~ 11
            });
        }


        var _id = uuid();
        var params = {Bucket: 'harubaas', Key: applicationId+'/'+_id+'_'+file.originalname , Body: file.buffer};

        var data = {
            _id: _id,
            createdAt: header.timestamp,
            updatedAt: header.timestamp,

            size: file.size,
            originalName: file.originalname,
            extension: file.extension
        };

        async.series([
            function putS3(callback) {
                //s3.putObject(params, callback);
            },
            function saveMetaData(callback) {
                //_saveMetaData(applicationId, data, callback);
            }
        ], function done(error, results) {
            next(error, data);
        });
    },function done(error, results) {
        callback(error, results);
    });
};




function _saveMetaData(applicationId, data, callback) {
    var isNewClass = false;

    async.series([
        function exitsClass(callback) {
            store.get('public').sismember(keys.classesKey(applicationId), FileClassName,function(error, results) {
                if( error ) { return callback(error, results); }

                if( !Boolean(results) ) {
                    // 첫 클래스 생성시 shard collection, schema를 추가
                    store.get('mongodb').addShardCollection(keys.collectionKey(FileClassName, applicationId));
                    store.get('public').sadd(keys.classesKey(applicationId), FileClassName);
                    _saveSchema(applicationId, data);
                }

                callback(error, results);
            });
        },
        function createMongoDB(callback){
            store.get('mongodb').insert(keys.collectionKey(FileClassName, applicationId), data, callback);
        },
        function createRedis(callback){
            store.get('service').multi()
                .hmset(keys.entityDetail(FileClassName, data._id, applicationId), data)
                .zadd(keys.entityKey(FileClassName, applicationId), data.updatedAt, data._id)
                .exec(callback);
        }
    ], function done(error, results) {
        callback(error, results);
    });
};

function _saveSchema(applicationId, data) {
    var schema = exportSchemaToJson(data, FileSchema);
    var schemaKey = keys.schemaKey(applicationId, FileClassName);

    store.get('service').hmset(schemaKey, schema);
}