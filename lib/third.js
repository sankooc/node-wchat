var crypto = require('crypto');
var async = require('async');
var request = require('request')
var parseString = require('xml2js').parseString;
var common = require('./common')

var block_size = 32;
var algo = 'aes-256-cbc'

var constans_url = {
    api_component_token: 'https://api.weixin.qq.com/cgi-bin/component/api_component_token',
    api_create_preauthcode: 'https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode',
    api_authorizer_token: 'https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token',
    api_query_auth: 'https://api.weixin.qq.com/cgi-bin/component/api_query_auth'
}

function raw(stream, callback) {
    var data = [];
    stream.on('data', function(chunk) {
        data.push(chunk);
    });
    stream.on('end', function() {
        var content = Buffer.concat(data);
        callback(null, content);
    });
    stream.on('error', function(err) {
        console.trace(err.stack);
        callback('stream error');
    });
}


module.exports = function(option, provider) {
    var sEncodingAESKey = option.aeskey;
    var AESKey = new Buffer(sEncodingAESKey + '=', 'base64').toString('binary');
    var appid = option.appid;
    var secret = option.secret;
    var token = option.token;
    var auto = !!option.auto;
    // var log = option.debug?console.log.bind(console):function(){};
    var log = console.log.bind(console);

    function _encrypt(random, msg) {
        var text = new Buffer(msg); //16
        var pad = dByteSize(text.length); //4
        var pack = PKCS7encode(20 + text.length + appid.length);
        var content = random + pad + text.toString('binary') + appid + pack;
        try {
            var cipher = crypto.createCipheriv(algo, AESKey, AESKey.slice(0, 16));
            cipher.setAutoPadding(auto_padding = false);
            var crypted = cipher.update(content, 'binary', 'base64') + cipher.final('base64');
            return crypted;
        } catch (e) {
            console.trace(e.stack);
            return;
        }
    }

    var encrypt = function(text) {
        var random = crypto.randomBytes(8).toString('hex');
        return _encrypt(random, text, appid);
    }

    var decrypt = function(text) {
        var decipher, plain_text;
        try {
            decipher = crypto.Decipheriv(algo, AESKey, AESKey.slice(0, 16));
            decipher.setAutoPadding(auto_padding = false);
            plain_text = decipher.update(text, 'base64', 'utf8') + decipher.final('utf8');
        } catch (e) {
            console.trace(e.stack);
            return;
        }
        var pad = plain_text.charCodeAt(plain_text.length - 1);
        plain_text = plain_text.slice(20, -pad);
        return plain_text;
    }

    var parse_verify_ticket = function(data, callback) {
        async.waterfall([function(callback) {
            log('ticket data %s', data.toString());
            parseString(data, callback);
        }, function(result, callback) {
            var _appid = result.xml.AppId[0];
            var content = result.xml.Encrypt[0];
            var dec = decrypt(content);
            var _inx = dec.lastIndexOf(_appid);
            if (_inx < 0) {
                console.dir(result);
                console.error(dec);
                return callback('error');
            }
            var _content = dec.substring(0, _inx);
            parseString(_content, callback);
        }, function(result, callback) {
            var type = result.xml.InfoType[0]
            var ticket = result.xml.ComponentVerifyTicket[0]
            callback(null, ticket);
        }], callback);
    }

    function fetch_component_access_token(callback) {
        async.waterfall([function(callback) {
            provider.ticket(callback)
        }, function(ticket, callback) {
            if (!ticket) {
                return callback('no ticket');
            }
            log('get ticket %s', ticket);
            var _data = {
                "component_appid": appid,
                "component_appsecret": secret,
                "component_verify_ticket": ticket
            }
            common.json_post(constans_url.api_component_token, {}, _data, callback);
        }, function(body, callback) {
            if (body) {
                var v = {
                    value: body.component_access_token,
                    expires_in: parseInt(body.expires_in)
                }
                callback(null, v);
                provider.componentAccessToken(v, function() {});
            } else {
                callback('failed to fetch CAT');
            }
        }], callback);
    }

    var get_component_access_token = common.getter_fac(fetch_component_access_token, provider.componentAccessToken);

    function fetch_pre_auth_code(callback) {
        async.waterfall([function(callback) {
            get_component_access_token(callback)
        }, function(cat, callback) {
            if (!cat) {
                callback('no cat');
                return log('no cat');
            }
            var _data = {
                "component_appid": appid
            }
            var url = constans_url.api_create_preauthcode;
            var qs = {
                component_access_token: cat
            }
            common.json_post(url, qs, _data, callback);
        }, function(body, callback) {
            if (body) {
                var v = {
                    value: body.pre_auth_code,
                    expires_in: parseInt(body.expires_in)
                }
                provider.authCode(v, function() {
                    callback(null, v);
                });
            } else {
                callback('failed to fetch code');
            }
        }], callback);
    }

    var get_pre_auth_code = common.getter_fac(fetch_pre_auth_code, provider.authCode);

    var getAuthToken = function(authCode, callback) {
        log('do auth with %s', authCode);
        async.waterfall([function(callback) {
            get_component_access_token(callback);
        }, function(token, callback) {
            if (!token) {
                callback('no cat');
                return log('no cat');
            }
            if (token) {
                log('get access_token %s', token);
                var url = constans_url.api_query_auth;
                common.json_post(url, {
                    component_access_token: token
                }, {
                    "component_appid": appid,
                    "authorization_code": authCode
                }, callback);
            } else {
                log('no token');
                callback('no token');
            }
        }], callback);
    }

    var refreshToken = function(_appid, refreshToken, callback) {
        async.waterfall([function(callback) {
            get_component_access_token(callback);
        }, function(token, callback) {
            if (!token) {
                callback('no cat');
                return log('no cat');
            }
            if (token) {
                log('get access_token %s', token);
                var url = constans_url.api_authorizer_token;
                var qs = {
                    component_access_token: token
                }
                var _data = {
                    "component_appid": appid,
                    "authorizer_appid": _appid,
                    "authorizer_refresh_token": refreshToken
                }
                common.json_post(url, qs, _data, callback);
            } else {
                log('no token');
                callback('no token');
            }
        }], callback);
    };

    return {
        bind: function(req, res) {
            async.waterfall([
                async.apply(raw, req),
                parse_verify_ticket,
                provider.ticket
            ], function(err) {
                if (err) {
                    res.status(400);
                }
                res.end();
            });
        },
        get_auth_code: get_pre_auth_code,
        update_access_token: get_pre_auth_code,
        refresh_token: refreshToken,
        get_auth_token: getAuthToken
    }
}
