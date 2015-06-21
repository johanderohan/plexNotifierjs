#!/usr/bin/env node

var request = require('request')
var xml2js = require('xml2js').parseString;
var uuid = require('node-uuid');

var path = require('path')
var bodyParser = require('body-parser')
var express = require('express')
var app = express()

var CronJob = require('cron').CronJob;
var CRONSESSIONS, CRONUPDATES;
var Datastore = require('nedb')
  , db = new Datastore({ filename: path.join(__dirname+'/data.db'), autoload: true });
var push = require( 'pushover-notifications' );
var nodemailer = require('nodemailer');

var PLEX_INFO = {};
var SECTION_INFO = {};
var PUSHOVER_INFO = {};
var MAIL_INFO = {};

var WATCHERS = 0;
var LASTDATE;

var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

app.set('views', path.join(__dirname+'/views'));
app.set('view engine', 'ejs');
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({  extended: true }))
app.use("/assets", express.static(__dirname + '/assets'));

loadTokens();

app.get('/', function (req, res) {
    if(PLEX_INFO.accessToken){
    	res.render('index', {plex:PLEX_INFO, pushover:PUSHOVER_INFO, mail:MAIL_INFO})
    }
    else{
        res.render('login');
    }
})

function getLibraries(){
	// Set the headers
    var headers = {
        'X-Plex-Platform': 'Node.js',
        'X-Plex-Platform-Version': '0.10.33',
        'X-Plex-Provides': 'controller',
        'X-Plex-Client-Identifier': PLEX_INFO.uuid,
        'X-Plex-Product': 'PlexNotifier.js',
        'X-Plex-Version': '0.0.1',
        'X-Plex-Device': 'Node Client',
        'X-Plex-Token': PLEX_INFO.accessToken
    }

    // Configure the request
    var options = {
        url: PLEX_INFO.scheme+'://'+PLEX_INFO.localAddresses+':'+PLEX_INFO.port+'/library/sections',
        method: 'GET',
        headers: headers
    }

    request(options, function (error, response, body) {        

        var json;
        xml2js(body, function (err, result) {
            json = result;
        });

        var section_info = {
                		value: 'section_info',
                		section: []
                	}

        for (var library in json.MediaContainer.Directory) {
        	var section = {
        		key: json.MediaContainer.Directory[library].$.key,
        		type: json.MediaContainer.Directory[library].$.type,
        		title: json.MediaContainer.Directory[library].$.title
        	}
        	section_info.section.push(section);
        }
        db.remove({ value: 'section_info' }, { multi: true });
        db.insert(section_info, function (err, newDoc) {   
                    	SECTION_INFO = section_info;
                    });

    })
}

function loadTokens(){
    db.findOne({ value: 'plex_info' }, function (err, doc) {
        if(doc){

            PLEX_INFO.accessToken = doc.accessToken;
            PLEX_INFO.name = doc.name;
            PLEX_INFO.uuid = doc.uuid;
            PLEX_INFO.scheme = doc.scheme;
            PLEX_INFO.localAddresses = doc.localAddresses[0];
            PLEX_INFO.address = doc.address;
            PLEX_INFO.port = 32400;
            PLEX_INFO.uuid = doc.uuid;
            getLibraries();
            //cronSession();
            //cronUpdates();
        }
    });

    db.findOne({ value: 'section_info' }, function (err, doc) {
        if(doc){
            SECTION_INFO = doc;
        }
    });


    db.findOne({ value: 'pushover_info' }, function (err, doc) {
        if(doc){

            PUSHOVER_INFO.pushover_user = doc.pushover_user;
            PUSHOVER_INFO.pushover_token = doc.pushover_token;

            cronSession();
        }
    });

    db.findOne({ value: 'mail_info' }, function (err, doc) {
        if(doc){

            MAIL_INFO.mail_host = doc.mail_host,
	        MAIL_INFO.mail_port = doc.mail_port,
	        MAIL_INFO.mail_user = doc.mail_user,
	        MAIL_INFO.mail_pass = doc.mail_pass,
	        MAIL_INFO.mail_mail = doc.mail_mail,
	        MAIL_INFO.mail_recipients = doc.mail_recipients

            cronUpdates();
        }
    });
}

function sendPushover(message){
    var p = new push( {
        user: PUSHOVER_INFO.pushover_user,
        token: PUSHOVER_INFO.pushover_token
    });

    var msg = {
        message: message,   
    };

    p.send(msg);
}

function sendMail(message){

    var dt = new Date();
    var today = dt.getDate() + "/" + (parseInt(dt.getMonth()) + 1) + "/" + dt.getFullYear();

    var transport = nodemailer.createTransport(smtpTransport({
	    host: MAIL_INFO.mail_host,
	    port: MAIL_INFO.mail_port,
	    auth: {
	        user: MAIL_INFO.mail_user,
	        pass: MAIL_INFO.mail_pass
	    }
	}));

	transport.sendMail({
		from: MAIL_INFO.mail_mail,
		to: MAIL_INFO.mail_recipients,
		subject: 'Plex was updated! - '+today,
		text: message
	}, function(err,info){
		console.log(info);
	});

}

function cronUpdates(){
    var headers = {
        'X-Plex-Platform': 'Node.js',
        'X-Plex-Platform-Version': '0.10.33',
        'X-Plex-Provides': 'controller',
        'X-Plex-Client-Identifier': PLEX_INFO.uuid,
        'X-Plex-Product': 'PlexNotifier.js',
        'X-Plex-Version': '0.0.1',
        'X-Plex-Device': 'Node Client',
        'X-Plex-Token': PLEX_INFO.accessToken
    }

    if(!LASTDATE) LASTDATE = Math.floor(Date.now() / 1000);

    CRONUPDATES = new CronJob('00 30 8 * * *', function(){

	    var the_sections = [];
	    var msg ='';
	    var send = false;

    	for (var section in SECTION_INFO.section) {

    		var options_section = {
		        url: PLEX_INFO.scheme+'://'+PLEX_INFO.localAddresses+':'+PLEX_INFO.port+'/library/sections/'+SECTION_INFO.section[section].key+'/recentlyAdded',
		        method: 'GET',
		        headers: headers
		    }

		    var requets = request(options_section, function (error, response, body) { 
		    	var json;
	            xml2js(body, function (err, result) {
	                json = result;
	            });

	            for (var s in SECTION_INFO.section) {

			    	if(SECTION_INFO.section[s].type == "show" && SECTION_INFO.section[s].key == json.MediaContainer.$.librarySectionID){
			    		var shows = json.MediaContainer.Video;

			    		msg += 'SHOWS\n';
			            msg += '----------------\n';
			            for (var media in shows) {
			                if(shows[media].$.addedAt > LASTDATE){
			                    send = true;
			                    msg += shows[media].$.grandparentTitle;
			                    msg += ' - '+shows[media].$.parentIndex;
			                    if (shows[media].$.index < 10 && shows[media].$.index >= 0)
			                        msg += 'x0'+shows[media].$.index;
			                    else 
			                        msg += 'x'+shows[media].$.index;
			                    msg += ' '+shows[media].$.title;
			                    msg += '\n';
			                }
			            }
			            msg += '\n';

			    	}
			    	else if(SECTION_INFO.section[s].type == "movie" && SECTION_INFO.section[s].key == json.MediaContainer.$.librarySectionID) {
			    		var movies = json.MediaContainer.Video;

			    		msg += '\n';
			            msg += 'MOVIES\n';
			            msg += '----------------\n';
			            for (var media in movies) {
			                if(movies[media].$.addedAt > LASTDATE){
			                    send = true;
			                    msg += movies[media].$.title+' ('+movies[media].$.year+')'+'\n';
			                }
			            }
			            msg += '\n';
			    	}
			    }

        	});

    	}

    	setTimeout(
		  function() 
		  {
		    if(send){
                send = false;
                LASTDATE = Math.floor(Date.now() / 1000);
                console.log(msg);
                sendMail(msg);
            }
		  }, 8000);

    }, null, true);
}

function cronSession(){

    // Set the headers
    var headers = {
        'X-Plex-Platform': 'Node.js',
        'X-Plex-Platform-Version': '0.10.33',
        'X-Plex-Provides': 'controller',
        'X-Plex-Client-Identifier': PLEX_INFO.uuid,
        'X-Plex-Product': 'PlexNotifier.js',
        'X-Plex-Version': '0.0.1',
        'X-Plex-Device': 'Node Client',
        'X-Plex-Token': PLEX_INFO.accessToken
    }

    // Configure the request
    var options = {
        url: PLEX_INFO.scheme+'://'+PLEX_INFO.localAddresses+':'+PLEX_INFO.port+'/status/sessions',
        method: 'GET',
        headers: headers
    }

    CRONSESSIONS = new CronJob('0 */5 * * * *', function(){
        request(options, function (error, response, body) {        

            var json;
            xml2js(body, function (err, result) {
                json = result;
            });

            if (WATCHERS != json.MediaContainer.$.size && json.MediaContainer.$.size != 0){
                WATCHERS = json.MediaContainer.$.size;

                var msg = '';

                if(json.MediaContainer.Video[0].$.type == 'movie'){
                    msg += json.MediaContainer.Video[0].User[0].$.title;
                    msg += ' is watching '+json.MediaContainer.Video[0].$.title+' ('+json.MediaContainer.Video[0].$.year+')';
                    msg += ' in '+json.MediaContainer.Video[0].Player[0].$.title;
                }

                else{
                    msg += json.MediaContainer.Video[0].User[0].$.title;
                    msg += ' is watching '+json.MediaContainer.Video[0].$.grandparentTitle;
                    msg += ' - '+json.MediaContainer.Video[0].$.parentIndex;
                    if (json.MediaContainer.Video[0].$.index < 10 && json.MediaContainer.Video[0].$.index >= 0)
                        msg += 'x0'+json.MediaContainer.Video[0].$.index;
                    else 
                        msg += 'x'+json.MediaContainer.Video[0].$.index;
                    msg += ' '+json.MediaContainer.Video[0].$.title;
                    msg += ' in '+json.MediaContainer.Video[0].Player[0].$.title;
                }
                
                if (PUSHOVER_INFO.pushover_user && PUSHOVER_INFO.pushover_token){
                    sendPushover(msg);
                }
                
                console.log(msg);
            }

            if(json.MediaContainer.$.size == 0) WATCHERS = 0;
        })
    }, null, true);

}

app.post('/login', function(req, res){

    var username = req.body.user
    var password = req.body.pass

    // Set the headers
    var theuuid = uuid.v4();
    var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
    var headers = {
        'X-Plex-Platform': 'Node.js',
        'X-Plex-Platform-Version': '0.10.33',
        'X-Plex-Provides': 'controller',
        'X-Plex-Client-Identifier': theuuid,
        'X-Plex-Product': 'PlexNotifier.js',
        'X-Plex-Version': '0.0.1',
        'X-Plex-Device': 'Node Client',
        'Authorization': auth
    }

    // Configure the request
    var options = {
        url: 'https://plex.tv/pms/servers',
        method: 'GET',
        headers: headers
    }

    // Start the request
    request(options, function (error, response, body) {        

        var json;
        xml2js(body, function (err, result) {
            json = result;
        });

        for (var servers in json) {
            for (var server in json[servers].Server) {
                if (json[servers].Server[server].$.name != "Cloud Sync" && json[servers].Server[server].$.owned != 0){
                	var plex_info = {
                		value: 'plex_info',
                		accessToken: json[servers].Server[server].$.accessToken,
                		name: json[servers].Server[server].$.name,
                		scheme: json[servers].Server[server].$.scheme,
                		address: json[servers].Server[server].$.address,
                		port: 32400,
                		localAddresses: json[servers].Server[server].$.localAddresses.split(','),
                		uuid: theuuid
                	}

                    db.insert(plex_info, function (err, newDoc) {   
                    	PLEX_INFO = plex_info;
                    	loadTokens();
                    	//getLibraries();
                        //cronSession();
                        //cronUpdates();
                    });
                }
            }
        }

        res.redirect('/');
    })

});

app.post('/logout', function(req, res){

	db.remove({ value: 'plex_info' }, { multi: true });
	db.remove({ value: 'section_info' }, { multi: true });

	PLEX_INFO = {};
	SECTION_INFO = {};
	if (CRONUPDATES) CRONUPDATES.stop();
	if (CRONUPDATES) CRONSESSIONS.stop();

    res.redirect('/');

});

app.post('/savepushover', function(req, res){

	db.remove({ value: 'pushover_info' }, { multi: true });
	PUSHOVER_INFO = {};
	if(CRONSESSIONS) CRONSESSIONS.stop();

	if(req.body.pushover_user && req.body.pushover_token){

		var pushover_info = {
	                		value: 'pushover_info',
	                		pushover_user: req.body.pushover_user,
	                		pushover_token: req.body.pushover_token
	                	}

	    db.insert(pushover_info, function (err, newDoc) {   
	    	PUSHOVER_INFO = pushover_info;

	        cronSession();
	    });

	}

    res.redirect('/');

});

app.post('/savemail', function(req, res){

	db.remove({ value: 'mail_info' }, { multi: true });
	MAIL_INFO = {};
	if(CRONUPDATES) CRONUPDATES.stop();

	if(req.body.mail_host && req.body.mail_port && req.body.mail_user && req.body.mail_pass && req.body.mail_mail && req.body.mail_recipients){

		var mail_info = {
	                		value: 'mail_info',
	                		mail_host: req.body.mail_host,
	                		mail_port: req.body.mail_port,
	                		mail_user: req.body.mail_user,
	                		mail_pass: req.body.mail_pass,
	                		mail_mail: req.body.mail_mail,
	                		mail_recipients: req.body.mail_recipients
	                	}

	    db.insert(mail_info, function (err, newDoc) {   
	    	MAIL_INFO = mail_info;

	        cronUpdates();
	    });

	}

    res.redirect('/');

});

var server = app.listen(3081, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('PlexNotifier.js listening at http://%s:%s', host, port)

})
