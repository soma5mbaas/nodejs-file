
var fileHandler = require('../handlers/file');
var getHeader = require('haru-nodejs-util').common.getHeader;
var sendError = require('haru-nodejs-util').common.sendError;

var escape = require("querystring").escape;

var cloudfront = require('../config').cloudfront;

exports.upload = function(req, res) {
    var header = getHeader(req);

    console.log('get : ' + req.files);
    fileHandler.uploadS3(header, req.files, function(error, results) {
        console.log(error, results);

        if(error) { return sendError(res, error); }
        if(!results) { return sendError(res, new Error('')); }
        
        

        var output = [];
        for( var i = 0; i < results.length; i++ ) {
            if(results[i]._id) {
                output.push({
                    _id: results[i]._id,
                    updatedAt: results[i].updatedAt,
                    createdAt: results[i].createdAt,
                    originalName: results[i].originalName,
                    url: cloudfront + escape(header.applicationId + '/' + results[i]._id + '_' + results[i].originalName)
                });
            }
        }

        res.json({results: output});
    });
};