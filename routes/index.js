var express = require('express');
var router = express.Router();

var file = require('../controllers/file');


/* GET home page. */
router.get('/', function(req, res) {
  res.json({});
});


router.post('/files', file.upload);

module.exports = router;
