var request = require('request')
var async = require('async')
var common = require('./common')
var crypto = require('crypto')
var util = require('util');
var _ = require('lodash');
var xml2js = require('xml2js');

var constans_url = {
    getticket:     'https://api.weixin.qq.com/cgi-bin/ticket/getticket'
    ,token:        'https://api.weixin.qq.com/cgi-bin/token'
    ,access_token: 'https://api.weixin.qq.com/sns/oauth2/access_token'
    ,unifiedorder: 'https://api.mch.weixin.qq.com/pay/unifiedorder'
}

function _hash(str){
    var hash = crypto.createHash('md5');
    hash.update(str,'utf8');
    return hash.digest('hex')
}

module.exports = function(option,provider){
    var appid = option.appid;
    var secret = option.secret;
    var app_token = option.token;
    var aeskey = option.aeskey;
    var mchid = option.mchid;
    var paykey = option.paykey;
    var auto = !!option.auto;
    var log = console.log.bind(console)

    function _js_sign(option){
        var noncestr = option.noncestr
        var jsapi_ticket = option.jsapi_ticket;
        var timestamp = option.timestamp;
        var url = option.url
        var _str = util.format('jsapi_ticket=%s&noncestr=%s&timestamp=%s&url=%s',jsapi_ticket,noncestr,timestamp,url)
        var sign = _hash(_str);
        return sign;
    }

    //https://pay.weixin.qq.com/wiki/doc/api/jsapi.php?chapter=9_1
    function unionpaySign(option){
        var params = _.pick(option,'body','out_trade_no','total_fee','spbill_create_ip','openid','notify_url');
        params.trade_type = "JSAPI";
        params.appid = appid;
        params.mch_id = mchid;
        params.nonce_str = common.generateRandomStr(16);
        // params.notify_url = config.domain+"/platform/notify";
        var str = util.format('appid=%s&body=%s&mch_id=%s&nonce_str=%s&notify_url=%s&openid=%s&out_trade_no=%s&spbill_create_ip=%s&total_fee=%s&trade_type=%s&key=%s',
                                params.appid,params.body,params.mch_id,params.nonce_str,params.notify_url,
                                params.openid,params.out_trade_no,params.spbill_create_ip,params.total_fee,
                                params.trade_type,paykey);
        params.sign = _hash(str).toUpperCase();
        console.dir(params);
        return params;
    }

    function prepaySign(prepayid){
        var packageData = "prepay_id="+prepayid;
        var timestamp = parseInt(Date.now()/1000);
        var nonceStr = common.generateRandomStr(16);
        var _str = util.format('appId=%s&nonceStr=%s&package=%s&signType=%s&timeStamp=%s&key=%s',appid,nonceStr,packageData,"MD5",timestamp,paykey);
        var sign = _hash(_str).toUpperCase();
        return {paySign:sign,nonceStr:nonceStr,timestamp:timestamp,package:packageData,signType:'MD5'}
    }

    function getPrepayId (option,callback){
        var url = constans_url.unifiedorder;
        var xmlObj = unionpaySign(option);
        var builder = new xml2js.Builder({rootName:'xml',headless :true,cdata:true});
        var xml = builder.buildObject(xmlObj);
        common.xml_post(url,{},xml,function(err, result){
            if (err) {
                return callback(err);
            }
            if (result) {
                console.dir(result.xml);
                var code = result.xml.result_code[0];
                if(code === 'SUCCESS'){
                    var prepay_id = result.xml.prepay_id[0];
                    return callback(null,prepay_id);
                }
            }
            callback(result);
        });

    }

    function createPayOption(option, callback){
        async.waterfall([function(callback){
            getPrepayId(option, callback)
        },function(prepay_id,callback){
            callback(null,prepaySign(prepay_id));
        }],callback);
    }

    function fetch_access_token(callback){
        var qs = {
            grant_type: 'client_credential'
            ,appid: appid
            ,secret: secret
        };
        var url = constans_url.token;
        async.waterfall([function(callback){
            common.json_get(url,qs,callback);
        },function(body,callback){
            var v = {
                value: body.access_token
                ,expires_in: parseInt(body.expires_in)
            }
            callback(null,v);
            provider.accessToken(v,function(){});
        }],callback);
    }

    var get_access_token = common.getter_fac(fetch_access_token,provider.accessToken);

    function fetch_js_api(callback){
        async.waterfall([function(callback){
            get_access_token(callback)
        },function(token,callback){
            console.dir(token);
            if(!token){
                callback('no token');
                return log('no token');
            }
            var url = constans_url.getticket;
            var qs = {
                access_token: token,
                type: 'jsapi'
            }
            common.json_get(url,qs,callback);
        },function(body,callback){
            if(body){
                var v = {
                    value: body.ticket
                    ,expires_in: parseInt(body.expires_in)
                }
                callback(null,v);
                provider.jsApiToken(v,function(){});
            }else{
                callback('failed to fetch code');
            }
        }],callback);
    }

    var get_js_api = common.getter_fac(fetch_js_api,provider.jsApiToken);

    var getUnionId = function(openid, callback){
        async.waterfall([function(callback){
            get_access_token(callback);
        },function(token,callback){
            common.userinfo(openid,token,callback);
        }],callback);
    }

    //https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1421141115&token=&lang=zh_CN
    var getJSSignature = function(url,callback){
        var option = {
            noncestr: common.generateRandomStr(16)
            ,url: url
        }
        async.waterfall([function(callback){
            get_js_api(callback);
        },function(ticket,callback){
            option.jsapi_ticket = ticket;
            option.timestamp = parseInt(Date.now()/1000);
            var sign =_js_sign(option);
            callback(null,{
                appId: appid
                ,timestamp: option.timestamp
                ,nonceStr: option.noncestr
                ,signature: sign
            })
        }],callback);
    }

    var parse_code = function(code,callback){
        async.waterfall([function(callback){
            var qs = {
                appid: appid
                ,secret: secret
                ,code: code
                ,grant_type: 'authorization_code'
            }
            var url = constans_url.access_token;
            common.json_get(url,qs,callback);
        },function(auth,callback){
            var openid = auth.openid;
            if(!openid){
                console.error('no openid');
                callback('no openid');
            }else{
                // console.log('parse code[%s] to openid [%s]',code,openid);
                callback(null,openid);
            }
        }],callback);
    }

    function menu(option,callback){
        async.waterfall([function(callback){
            get_access_token(callback)
        },function(token,callback){
            common.menu(token,option,callback);
        }],callback);
    }

    return {
        js_signature: getJSSignature
        ,getUnionId: getUnionId
        ,update_ticket: getJSSignature
        ,createPayOption: createPayOption
        ,parse_code: parse_code
        ,prepaySign: prepaySign
        ,getPrepayId: getPrepayId
        ,menu: menu
    }
}
