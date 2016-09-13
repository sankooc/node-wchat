var async = require('async');
var request = require('request');
var q = require('q')
var parseString = require('xml2js').parseString;
var _ = require('lodash')
var raw = function(stream,callback){
    var data = [];
    stream.on('data', function(chunk) {
        data.push(chunk);
    });
    stream.on('end', function() {
        var content = Buffer.concat(data);
        callback(null,content);
    });
    stream.on('error', function(err) {
        console.trace(err.stack);
        callback('stream error');
    });
}

exports.generate_random_str = function(len) {
    var rdmString = "";
    for (; rdmString.length < len; rdmString += Math.random().toString(36).substr(2));
    return rdmString.substr(0, len);
}

exports.getter_fac = function(fetcher,getter){
    var _promise;
    var expired;
    return function(callback){
        getter(function(err,value){
            if(err){
                return callback(err);
            }
            if(value){
                _promise = null;
                return callback(null,value);
            }else{
                if(_promise && expired && Date.now() > expired){
                    _promise = null;
                }
                if(!_promise){
                    var deferred = q.defer();
                    _promise = deferred.promise;
                    fetcher(function(err,v){
                        if(err){
                            deferred.reject(err);
                            _promise = null;
                            expired = 0;
                            return;
                        }
                        expired = Date.now() + (v.expires_in * 1000);
                        deferred.resolve(v.value);
                    });
                }
                return _promise.then(function(v){
                    callback(null,v);
                },function(err){
                    callback(err);
                });
            }
        });
    }
}

exports.toRaw = raw;

exports.toXml = function(stream,callback){
    async.waterfall([async.apply(raw,stream),parseString],callback);
}

function _res(callback){
    return function(err,resp,body){
        if(err){
            console.trace(err.stack);
            return callback(err);
        }
        if(resp.statusCode !== 200 || body.errcode){
            console.error('error code %s or errorcode %s',resp.statusCode,body.errcode);
            console.dir(body);
            return callback(body);
        }
        return callback(null,body);
    }
}

exports.json_get = function(url,qs,callback){
    request.get({
        url: url,
        qs: qs,
        json: true
    },_res(callback));
}

exports.json_post = function(url,qs,data,callback){
    request.post({
        url: url,
        qs: qs,
        body: data,
        json: true
    },_res(callback));
}

exports.xml_post = function(url,qs,xml,callback){
    async.waterfall([function(callback){
        request.post({url:url,qs:qs,body:xml},callback);
    },function(resp,body,callback){
        if(resp.statusCode !== 200){
            console.error('request failed [%s]',resp.statusCode);
            console.error(body);
            return callback(body);
        }
        parseString(body,callback);
    }],callback);
}

var constans_url = {
    get:      'https://api.weixin.qq.com/cgi-bin/user/get',
    info:     'https://api.weixin.qq.com/cgi-bin/user/info',
    menu_get: 'https://api.weixin.qq.com/cgi-bin/menu/get',
    batchget: 'https://api.weixin.qq.com/cgi-bin/user/info/batchget'
}

exports.user_info = function(openid,access_token,callback){
    async.waterfall([function(callback){
        var url = constans_url.info;
        var qs = {
            access_token: access_token
            ,openid: openid
        }
        exports.json_get(url,qs,callback);
    },function(user,callback){
        callback(null,user);
    }],callback);
}

function _user_list(access_token,nextId,callback){
    var url = constans_url.get
    var qs = {
        access_token: access_token
    }
    return exports.json_get(url,qs,callback);
}

function _user_infos(access_token,uids,callback){
    var url = constans_url.batchget;
    var qs = {
        access_token: access_token
    }
    var groups = _.chunk(uids,100);
    async.reduce(groups, [], function(ret, uids, callback) {
        var _data = {
            user_list: uids.map(function(uid){
                return {
                    openid: uid,
                    lang: "zh-CN"
                }
            })
        }
        exports.json_post(url,qs,_data,function(err,body){
            if(err){
                console.trace(err.stack)
                return callback(err);
            }
            var users = body.user_info_list;
            Array.prototype.push.apply(ret,users);
            callback(null,ret);
        });
    },callback);
}

exports.menu = function(access_token,option,callback){
    if(typeof option === 'function'){
        callback = option;
        var url = constans_url.menu_get;
        var qs = {
            access_token: access_token
        }
        return exports.json_get(url,qs,callback);
    }
}

exports.get_user_list = function(access_token,nextId,callback){
    async.waterfall([function(callback){
        _user_list(access_token,nextId,callback);
    },function(resp,callback){
        _user_infos(access_token,resp.data.openid,callback);
    }],callback);
}
