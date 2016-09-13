var express = require('express');
var app = express();
var provider = require('./redis_provider');
var mp = require('node-wchat').mp;
var open = require('node-wchat').open;

var _mp = mp({
    appid:  '',
    secret: '',
    token:  '',
    aeskey: '',
    mchid:  '',
    paykey: ''
},provider);

var _open = open({
    appid:  '',
    aeskey: '',
    secret: '',
    token:  ''
},provider);

function parse_open_id(req,res,next){
    if (req.session && req.session.openid) {
        req.openid = req.session.openid;
        return next();
    }
    var code = req.query.code;
    _mp.parse_code(code,function(err,openid){
        if(err){
            console.error(err);
            return res.status(400).end();
        }
        if(!openid){
            console.error('no openid');
            res.status(400).end();
        }else{
            req.openid = openid;
            if (req.session) {
                req.session.openid = openid;
                req.session.save();
            }
            next();
        }
    });
}

//获取支付配置
app.get('/option/pay',parse_open_id,function(req,res){
    var query = req.query;
    var content = req.content;
    var price = parseInt(query.price);
    if(!price){
        return res.status(400).end();
    }
    var userip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var openid = req.openid
    var option = {
        body: content
        ,out_trade_no: "demo"+Date.now()
        ,total_fee: price
        ,spbill_create_ip: userip
        ,openid: openid
        ,trade_type: 'JSAPI'
        ,notify_url: ''//notify url
    }
    _mp.get_pay_option(option,function(err,poption){
        if(err){
            console.error(err);
            return res.status(400).end();
        }
        res.json(poption);
    });
});

//接收component_verify_ticket
app.post('/bind',_open.bind);

//进入授权页
app.get('/authpage',function(req,res){
    _open.get_auth_code(function(err,code){
        if(err){
            console.trace(err.stack);
            return res.status(400).end();
        }
        var redirect = ''//回调URL
        var url = 'https://mp.weixin.qq.com/cgi-bin/componentloginpage?component_appid='+appid+'&pre_auth_code='+code+'&redirect_uri='+redirect;
        res.redirect(url);
    });
});

//回调url
app.get('/platform',function(req,res){
    var auth = req.query;
    async.waterfall([function(callback){
        _open.get_auth_token(auth.auth_code,callback);
    },function(resp,callback){
        //保存refreshtoken
        callback();
    }],function(){
        res.end();
    });
});

app.listen(8081, function(){});
