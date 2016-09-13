var parseString = require('xml2js').parseString;

exports.fromXml = function(req,res,next){
    var data = [];
    req.on('data', function(chunk) {
        data.push(chunk);
    });
    req.on('end', function() {
        var content = Buffer.concat(data);
        var xml = content.toString('utf8');
        parseString(xml, function (err, result) {
            if(err){
                return res.status(400).end();
            }
            req.result = result;
            next();
        });
    });
    req.on('error', function(err) {
        next(err);
    });
}
