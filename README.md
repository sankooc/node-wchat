##  wechat

[![NPM](https://nodei.co/npm/node-wchat.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/node-wchat/)

微信公众/开放平台开发工具

### 安装

` npm install node-wchat --save `

### 准备

1. 添加ticket,token的存储策略 (可参考[RedisProvider](demo/redis_provider.js))
2. 配置平台信息

```

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

```

### DEMO

* 获取微信jssdk支付配置

```

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

```

* 第三方平台接收component_verify_ticket

```
app.post('/bind',_open.bind);

```

* 用户授权页

```
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

```

* 回调获取授权码

```

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

```

查看 [demo](demo/app.js)

### 功能列表

#### 公众平台

* 用户管理
* 消息管理 (待开发)
* 微信支付
* 自定义菜单 (待开发)
* 扫一扫 (待开发)
* 摇一摇 (待开发)
* 微信卡券 (待开发)
* 统计信息 (待开发)

#### 第三方开发平台

* 授权和绑定
