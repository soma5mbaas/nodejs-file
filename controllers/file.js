
var fileHandler = require('../handlers/file');
var getHeader = require('haru-nodejs-util').common.getHeader;
var sendError = require('haru-nodejs-util').common.sendError;


exports.upload = function(req, res) {
    var header = getHeader(req);

    fileHandler.uploadS3(header, req.files, function(error, results) {
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

                    url: results[i].url,
                    size: results[i].size,

                    originalUrl: results[i].originalUrl,
                    originalSize: results[i].originalSize
                });
            }
        }

        res.json({results: output});
    });
};

