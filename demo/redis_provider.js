var async = require('async');
var redis = require("redis");
var redis_config; //config here
client = redis.createClient(redis_config);

function _set_expire(key,value,time,callback){
    async.waterfall([function(callback){
        client.set(key,value,callback);
    },function(status,callback){
        client.expire(key,time,callback)
    }],callback);
}

var _set = client.set.bind(client);

var _get = client.get.bind(client);

function _creator(key){
    return function(v,callback){
        if(typeof v === 'function'){
            callback = v;
            return _get(key,callback);
        }else{
            var value = v.value;
            var expires = v.expires_in;
            _set_expire(key,value,expires,callback);
        }
    };
}

exports.ticket = function(ticket,callback){
    if(typeof ticket === 'function'){
        callback = ticket;
        return _get('wechat_ticket',callback);
    }else{
        // console.log('save wechat_ticket %s',ticket);
        return _set('wechat_ticket',ticket,callback);
    }
};

exports.componentAccessToken = _creator('wechat_component_access_token');

exports.authCode             = _creator('wechat_auth_code');

exports.accessToken          = _creator('wechat_access_token');

exports.jsApiToken           = _creator('wechat_js_api_token');
