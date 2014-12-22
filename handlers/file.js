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
var cloudfront = require('../config').cloudfront;
var escape = require("querystring").escape;

var getShardKey = require('haru-nodejs-util').common.getShardKey;
var createEntityId = require('haru-nodejs-util').common.createEntityId;


AWS.config.loadFromPath(__dirname+'/aws.json');

var s3 = new AWS.S3();

exports.uploadS3 = function(header, files, callback) {
    if( !_.isObject(files) ) { return callback(new Error('file'), null); }
    var fields = Object.keys(files);
    var applicationId = header.applicationId;
    var timestamp = header.timestamp;

    async.times(fields.length, function(n, next) {
        var file = files[fields[n]];

        if( file.size === maxFileSize ) {
            return next(null, {});
        }

        if( file.mimetype === 'image/png' ) {
            _uploadPng(applicationId, timestamp, file, next);
        } else {
            _uploadFile(applicationId, timestamp, file, next);
        }


    },function done(error, results) {
        callback(error, results);
    });
};

exports.getMetaData = function(header, callback) {
    store.get('mongodb').aggreate(keys.collectionKey(FileClassName, header.applicationId),[{
        $group: {
            _id: null,
            size: {$sum: {
                $add: ['$size', {$ifNull: ['$originalSize', 0] }]
            }
            }
        }
    }], function(error, results) {
        if( results.length < 1 ) {
            results.push({size: 0});
        }

        callback(error, results[0]);
    });

};

function _uploadPng(applicationId, timestamp, file, next) {
    file.compressBuffer = pngquant.compress(file.buffer, {
        "speed": 10,
        "quality": [40, 60]
    });

    var _id = uuid();

    var originName = file.originalname;
    var compressName = 'compress:'+file.originalname;

    var originParams = {Bucket: 'harubaas', Key: applicationId+'/'+_id+'_'+originName , Body: file.buffer};
    var compressParams = {Bucket: 'harubaas', Key: applicationId+'/'+_id+'_'+compressName , Body: file.compressBuffer};


    var data = {
        _id: _id,
        createdAt: timestamp,
        updatedAt: timestamp,

        size: file.compressBuffer.length,
        originalSize: file.buffer.length,

        url: _createUrl(applicationId, _id, compressName),
        originalUrl: _createUrl(applicationId, _id, originName),

        originalName: file.originalname,
        extension: file.extension
    };

    async.series([
        function putS3Origin(callback) {
            s3.putObject(originParams, callback);
        },
        function putS3Compress( callback ) {
            s3.putObject(compressParams, callback);
        },
        function saveMetaData(callback) {
            _saveMetaData(applicationId, data, callback);
        }
    ], function done(error, results) {
        next(error, data);
    });
};

function _uploadFile(applicationId, timestamp, file, next) {
    var _id = uuid();
    var originName = file.originalname;

    var params = {Bucket: 'harubaas', Key: applicationId+'/'+_id+'_'+originName , Body: file.buffer};

    var data = {
        _id: _id,
        createdAt: timestamp,
        updatedAt: timestamp,

        url: _createUrl(applicationId, _id, originName),

        size: file.size,
        originalName: file.originalname,
        extension: file.extension
    };

    async.series([
        function putS3(callback) {
            s3.putObject(params, callback);
        },
        function saveMetaData(callback) {
            _saveMetaData(applicationId, data, callback);
        }
    ], function done(error, results) {
        next(error, data);
    });
};

function _createUrl(applicationId, _id, fileName) {
    return cloudfront + escape(applicationId + '/' + _id + '_' + fileName);
}


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
        function createId(callback) {
            createEntityId({ timestamp: data.updatedAt, public: store.get('public') }, function(error, id, shardKey) {
                data._id = id;
                callback(error);
            });
        },
        function createMongoDB(callback){
            store.get('mongodb').insert(keys.collectionKey(FileClassName, applicationId), data, callback);
        },
        function createRedis(callback){
            store.get('service').hmset(keys.entityDetail(FileClassName, data._id, applicationId), data, callback, getShardKey(data._id));
        },
        function saveMetaData(callback) {
            var metaKey = keys.fileMetadataKey(applicationId);

            var size = data.size;
            var count = 1;

            if( data.originalSize ) {
                size += data.originalSize;
                count += 1
            }

            store.get('public').multi()
                .zadd(keys.entityKey(FileClassName, applicationId), data.updatedAt, data._id)
                .hincrby(metaKey, 'totalSize', size)
                .hincrby(metaKey, 'count', count)
                .exec(function(error, results) {
                    callback(error, {totalSize: results[0], count: results[1]});
                });
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



