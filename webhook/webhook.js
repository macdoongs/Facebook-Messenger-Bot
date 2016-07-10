
var express = require('express'); // Framework
var router = express.Router();
var request = require('request');
var bodyParser = require('body-parser');

var querystring = require('querystring');

var striptags = require("striptags");	// Eliminate HTML tag

var fs = require('fs');

var xml2js = require('xml2js');
var parser = new xml2js.Parser();

var path = require('path');
var cheerio = require('cheerio');

var config = require('config.json')('./config/config.json');

var utf8 = require('utf8');

// Amazon RDS connect
var mysql = require('mysql');	// MySQL Database
var conn = mysql.createConnection({
	host      : config.rds.host,
	user      : config.rds.user,
	password  : config.rds.password,
	database  : config.rds.botdatabase
});

conn.connect();


// TODO Session related
var passport = require('passport')	// Facebook login function
    , FacebookStrategy = require('passport-facebook').Strategy;


// Google Cloud Vision API
var gConfig = {
	projectId: config.googlecloudvisionapi.projectId,
	keyFilename: './config/Korchid-f6d83906a691.json'
};


// Get a reference to the vision component
var gcloud = require('gcloud')(gConfig);
var vision = gcloud.vision();


var storeQuery = "";
var movieSeq;
var movieGrade;


// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
        console.log('Time: ', Date.now());
        next();
});

var userData;



// TODO Session related
// serialize
// 인증후 사용자 정보를 세션에 저장
passport.serializeUser(function(user, done) {
    console.log('serialize');
    done(null, userData= user);
});


// TODO Session related
// deserialize
// 인증후, 사용자 정보를 세션에서 읽어서 request.user에 저장
passport.deserializeUser(function(user, done) {
    //findById(id, function (err, user) {
    console.log('deserialize');
    done(null, userData = user);
    //});
});

passport.use(new FacebookStrategy({
        clientID: config.facebookpassport.clientId,
        clientSecret: config.facebookpassport.clientSecret,
        callbackURL: config.facebookpassport.callbackURL,
	profileFields : ['id', 'displayName', 'gender', 'location']
    },
    function(accessToken, refreshToken, profile, done) {
        User.findOrCreate({ facebookId : profile.id}, function(err, user){
		return done(null, user);
	});
	console.log("Profile : " + profile);
        //done(null,profile);
    }
));


// TODO Session related
//router.use(express.cookieParser());
//router.use(express.bodyParser());
//router.use(express.session({ secret: 'keyboard cat' }));
router.use(passport.initialize());
router.use(passport.session());
router.use(bodyParser.json());



// TODO log-in _ session
router.get('/auth/facebook',
	passport.authenticate('facebook'));

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { successRedirect: '/',
                                      failureRedirect: '/login' }));

router.post('/login', passport.authenticate('local', { successRedirect: '/',
                                                    failureRedirect: '/login' }));

// Check Access Token
router.get('/', function(req, res){

	if(req.query['hub.verify_token'] === config.bot.hub.verify_token){
		passport.authenticate('facebook');
		res.send(req.query['hub.challenge']);
	}

	res.send('Error, wrong validation token');
});

var searchWord;
var mode = 0;


// Facebook Message Webhook (Main function)
router.post('/', function (req, res) {
	messaging_events = req.body.entry[0].messaging;

	//console.log("req.body : " + req.body);
	//console.log("messaging_events : " +messaging_events);

	for (var i = 0; i < messaging_events.length; i++) {
		event = req.body.entry[0].messaging[i];

		//console.log("\n\nEvent message : " + event.message);
		//console.log(event.message.attachments);
		//console.log("length : " + messaging_events.length);

		//console.log("\n\nout Event postback : " + event.postback);

		sender = event.sender.id;

		//console.log(sender);

		if(event.message && event.message.text == '?'){
			//botMessage = "You can search a movie title!";
			botMessage = "영화 제목을 검색해볼래?";
			sendTextMessage(sender, botMessage, token);
			//botMessage = "Search a movie image!";
			botMessage = "영화 사진을 검색해봐~";
			sendTextMessage(sender, botMessage, token);

			continue;
		}

		//console.log("MODE = " + mode);

		if (event.message && event.message.text && !mode) {
			text = event.message.text;
			//console.log("\n\nGeneric text: " + text);
    			console.log("ID : " + sender);
			//storeQuery = event.message.text;

			searchWord = text;

			sendMovieform(sender, text.substring(0, 500));

			//botMessage = "Which movie do you want to make evaluation?";
			botMessage = "어떤 영화를 찾았어?";
			sendTextMessage(sender, botMessage, token);
			continue;
    		}else if (event.message && event.message.text && mode) {
			text = event.message.text;

			mode = 0;

			var sql = 'INSERT INTO WRITE_REVIEW (Uid, Sseq, Sword, Review, Rtime) VALUES (?, ?, ?, ?, ?)';

 			var params = [sender, movieSeq, searchWord, text, Date.now()];

			conn.query(sql, params, function(error, rows, fields){

				if(error){
					console.log(error);
				}else{
					botMessage = "리뷰를 저장했어~^^";
					sendTextMessage(sender, botMessage, token);
				}

			});
			continue;
		}
		/*
		for(var p =0; p<6; p++)
			console.log(mTitle[p]);
		*/

		if (event.postback) {
			text = JSON.stringify(event.postback);
			var pText = JSON.parse(text);
			//console.log("\n\nPostback text: " + text);
			//console.log("\n\nEvent postback : " + event.postback);
    			//sendTextMessage(sender, text, token);
			//var temptext = text.substring(12, 17);
			var temptext = pText.payload.substring(0, 5);
			var buttonSeq = pText.payload.substring(6, 7);
			//console.log("\n\nTEMP text: " + temptext);
			//console.log(buttonSeq);

			mode = 0;

			if("GRADE" === temptext){
				gradeMovie(sender);
				movieSeq = buttonSeq;

				//storeQuery += " " + movieSeq;
				//console.log("Query_Grade : " + storeQuery);

				//botMessage = "Please choose the movie's grade!";
				botMessage = "이 영화는 몇 점짜리야?";
				sendTextMessage(sender, botMessage, token);

				var sql = 'SELECT * FROM MOVIE WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '")';

                                conn.query(sql, function(error, rows, fields){
                                        if(error){
                                                console.log(error);
                                        }else{
                                                if(!rows.length){
                                                        console.log("No movie data, Insert!");

                                                        var sql = 'INSERT INTO MOVIE (Mname, Sseq, Sword) VALUES (?, ?, ?)';

                                                        var params = [mTitle[Number(movieSeq)], movieSeq, searchWord];

                                                        conn.query(sql, params, function(err, rows, fields){
                                                                if(err){
                                                                        throw err;
                                                                } else{
                                                                        console.log('rows : ', rows);
                                                                        console.log('fields : ', fields);
                                                                }
                                                       });

							sql = 'INSERT INTO SEARCH_BY (Uid, Sseq, Sword, Stime) VALUES (?, ?, ?, ?)';
                                                        params = [sender, movieSeq, searchWord , Date.now()];


                                                        conn.query(sql, params, function(err, rows, fields){
                                                                if(err){
                                                                        throw err;
                                                                } else{
                                                                        console.log('rows : ', rows);
                                                                        console.log('fields : ', fields);
                                                                }
                                                       });


                                                }else{
                                                        console.log("Already have movie data.");
                                                }
                                        }

                                });



				break;
			}else if("STAR_" === temptext){
				movieGrade = buttonSeq;

				var sql = 'SELECT * FROM EVALUATE_ WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '")';

                                conn.query(sql, function(error, rows, fields){
                                        if(error){
                                                console.log(error);
                                        }else{
                                                if(!rows.length){
							//botMessage = "Thank you for opinion";
							botMessage = "평가해줘서 고마워!";
							sendTextMessage(sender, botMessage, token);

                                                        console.log("No grade data, Insert!");

							var sql = 'INSERT INTO EVALUATE_ (Uid, Sseq, Sword, Grade) VALUES (?, ?, ?, ?)';
                                			var params = [sender, movieSeq, searchWord , movieGrade];

                                                        conn.query(sql, params, function(err, rows, fields){
                                                                if(err){
                                                                        throw err;
                                                                } else{
                                                                        console.log('rows : ', rows);
                                                                        console.log('fields : ', fields);
                                                                }
                                                       });
                                                }else{
                                                        console.log("Already have movie grade data.");
							botMessage = "이미 평가했어..";
							sendTextMessage(sender, botMessage, token);


							var sql = 'SELECT AVG(EVALUATE_.Grade) as AVG FROM MOVIE, EVALUATE_ WHERE MOVIE.Sseq=EVALUATE_.Sseq AND MOVIE.Sword = EVALUATE_.Sword AND MOVIE.Mname= "' + mTitle[Number(movieSeq)] + '" GROUP BY MOVIE.Mname';

                                			conn.query(sql, function(error, rows, fields){
								if(error){
									console.log(error);
								}else{
									var sGrade = JSON.stringify(rows);
									var pGrade = JSON.parse(sGrade);
									console.log(pGrade);
									var avgGrade = Number(pGrade[0].AVG);


									botMessage = "이 영화의 평점은 : " + avgGrade + "\n";
									console.log(avgGrade);
									sendTextMessage(sender, botMessage, token);

									botMessage = "";
									for(q=0; q < 5 - avgGrade; q++){
										botMessage += "☆";
									}
									for(q=0; q < avgGrade; q++){
										botMessage += "★";
									}
									sendTextMessage(sender, botMessage, token);
								}

							});
                                                }
                                        }

                                });


				//storeQuery = '';
				break;
			}else if("REVIE" === temptext){
				movieSeq = buttonSeq;

				reviewMovie(sender);

				break;
			}else if("W_REV" === temptext){
				console.log(searchWord);
				console.log(movieSeq);

				if(buttonSeq == 1){ // watch review
					var sql = 'SELECT * FROM WRITE_REVIEW WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '")';

                                	conn.query(sql, function(error, rows, fields){
                                        	if(error){
                                                	console.log(error);
                                        	}else{
                                                	if(!rows.length){
								botMessage = "아무도 리뷰를 안남겼네..?ㅎㅎ";
                                                        	sendTextMessage(sender, botMessage, token);
                                                	}else{

								sql = 'SELECT Review FROM WRITE_REVIEW WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '" ) order by rand() limit 5';

                                                        	conn.query(sql, function(error, rows, fields){
                                                                	if(error){
                                                                        	console.log(error);
                                                                	}else{
										sRow = JSON.stringify(rows);
                                                                        	pRow = JSON.parse(sRow);
                                                                        	for(w=0; w < pRow.length; w++){
                                                                                	botMessage = pRow[w].Review.toString(utf8);
                                                                         		sendTextMessage(sender, botMessage, token);
                                                                        	}

                                                                	}
								});

							}

						}
					});

				}else{ // write review
					var sql = 'SELECT * FROM WRITE_REVIEW WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '" AND Uid = "' + sender + '")';

                                	conn.query(sql, function(error, rows, fields){
                                        	if(error){
                                                	console.log(error);
                                        	}else{
                                                	if(!rows.length){
                                                        	//TODO Review out
                                                        	mode = 1;

                                                        	console.log(JSON.stringify(rows));

                                                        	botMessage = "이 영화에 대한 리뷰를 남겨줄래?";
                                                        	sendTextMessage(sender, botMessage, token);

                                                	}else{
                                                        	//botMessage = "이미 의견을 남겨주셨습니다..";
                                                        	//sendTextMessage(sender, botMessage, token);


                                                        	sql = 'SELECT Review FROM WRITE_REVIEW WHERE (Sword = "' +  searchWord + '" AND Sseq = "' + movieSeq + '" AND Uid = "' + sender + '")';

                                                        	conn.query(sql, function(error, rows, fields){
                                                                	if(error){
                                                                        	console.log(error);
                                                                	}else{
                                                                        	sRow = JSON.stringify(rows);
                                                                        	pRow = JSON.parse(sRow);
                                                                                botMessage = pRow[0].Review.toString(utf8);
                                                                                sendTextMessage(sender, "본인 : " + botMessage, token);
                                                                        }
                                                                });
                                                	}
						}

                                        });

                                }
			}else if("KNOCK" === temptext){

				//botMessage = "Hey, there~ \nYou can ask me about movies! \nI can tell you them as much as I know. \nAnd if you want more information, tell me '?'";
				botMessage = "안녕~ 영화에 대해 물어봐! 모르면 모른다고 '?' 하는거 잊지 말고!'";
                                sendTextMessage(sender, botMessage, token);

				var sql = 'SELECT * FROM USER WHERE Uid = ' +  sender;

                                conn.query(sql, function(error, rows, fields){
                                        if(error){
                                                console.log(error);
                                        }else{
                                                if(!rows.length){
                                                        console.log("No data, Insert!");
                                                        var sql = 'INSERT INTO USER (Uid, Fname, Lname, ProfilePic, Locale, TimeZone) VALUES (?, ?, ?, ?, ?, ?)';

                                                        var params = [sender, "NULL", "NULL", "NULL", "NULL", "NULL"];

                                                        conn.query(sql, params, function(err, rows, fields){
                                                                if(err){
                                                                        throw err;
                                                                } else{
                                                                        console.log('rows : ', rows);
                                                                        console.log('fields : ', fields);
                                                                }
                                                       });
                                                }else{
                                                        console.log("Already have user data.");
                                                }
                                        }

                                });


                        }

		} else if(event.message.attachments[0].type === "image"){
                        console.log("Image recognize OK!\n\n");

			vision.detectLabels(event.message.attachments[0].payload.url, function (err, labels){
  				if (err) {
    					console.log(err);
  				}else{
  					var label_str =  JSON.stringify(labels, null, 2);
					var label_par = JSON.parse(label_str);

					//console.log('label str : ', label_str);
					//console.log('label parse :', label_par);

					len = label_par.length;
					botMessage = "Keyword : \n";
					for(h=0; h<len; h++){
						botMessage += label_par[h] + "  ";
						if( h % 3 === 2){
							botMessage += "\n";
						}
					}
					sendTextMessage(sender, botMessage, token);

					//res.send('/callback');
					postPage("POST Test OK \n" + label_par);
				}
			});
		}
  	}

	res.sendStatus(200);
});


var token = config.bot.token;
var client_id = config.naverapi.client_id;
var client_secret = config.naverapi.client_secret;
var url = config.naverapi.url;



var mData = new Array(); // movie data array
var mTitle = new Array();


// TODO Check Authenticate function
function ensureAuthenticated(req, res, next) {
    // 로그인이 되어 있으면, 다음 파이프라인으로 진행
    if (req.isAuthenticated()) { return next(); }
    // 로그인이 안되어 있으면, login 페이지로 진행
    res.redirect('/');
}

// Send Text Message function
function sendTextMessage(sender, text) {
	messageData = {
  		text:text
  	}

	postMessageData(messageData);
}// SendTextMessage function End

// Send Generic Message (Movie) function
function sendMovieform(sender, text) {

	// Naver movie search API
   	var query = text;

	mTitle = new Array(); // movie title
	mData = new Array(); // movie data
	sData = new Array(); // grade base order

	var tData; // message data

	request({
     		url : url,
     		method: 'GET',
     		headers : {
      			'Content-Type':'application/xml',
      			'X-Naver-Client-Id':client_id,
      			'X-Naver-Client-Secret': client_secret    },
		qs: {'query' : text}
   	}, function(error, response, body) {
    		if(error) {
      			console.log(error);
    		}else{
			//console.log('Naver API Ok!');
			//console.log(body);

			parser.parseString(body, function(err, result){

				sResult = JSON.stringify(result);
				oResult = JSON.parse(sResult);
				//console.dir(sResult);
				//console.dir(oResult);


				sameNameNum = oResult.rss.channel[0].item.length; // same name movie number
				console.log(sameNameNum);

				for(var i = 0; i < sameNameNum; i++) {
    					mData[i] = oResult.rss.channel[0].item[i];

    					//console.log(mData[i].title);
				}

				for(var l = 0; l < sameNameNum; l += 3){

					switch(sameNameNum - l){
					case 1:
						makeMovieform(l, 1);
						break;
					case 2:
						makeMovieform(l, 2);
						break;
					default: // 3 and more
						makeMovieform(l, 3);
						break;
					}//switch end
				}//for end
			//});// parser end
		});// request end
	}});// function request end
}// SendGenericMessage function End


// Movie Review function
function reviewMovie(sender){
	var reviewForm = fs.readFileSync("./template/reviewform.json");

	messageData = JSON.parse(reviewForm);

	postMessageData(messageData);
}


// Evaluate Movie function
function gradeMovie(sender){

	var gradeForm = fs.readFileSync("./template/gradeform.json");
	messageData = JSON.parse(gradeForm);
	//console.log(messageData);

	postMessageData(messageData);
}

// Manipulate json file function
function makeMovieform(sequence, movieNum){
	var movieForm = fs.readFileSync("./template/movieform" + movieNum  + ".json");
	var messageData = JSON.parse(movieForm);

	//console.log(messageData.attachment.payload);

	for(var m = 0, n = sequence; m < movieNum; m++, n++){

		mTitle[n] = striptags(mData[n].title.toString("utf8"));
                messageData.attachment.payload.elements[m].title = mTitle[n];
                messageData.attachment.payload.elements[m].subtitle = mData[n].subtitle.toString("utf8") + "\n\n"
                                                                + "Director : " + mData[n].director.toString("utf8") + "\n"
                                                                + "Actor : " +  mData[n].actor.toString("utf8") + "\n"
                                                                + "Public date : " + mData[n].pubDate.toString("utf8")+ "\n";
                messageData.attachment.payload.elements[m].item_url = "https://www.facebook.com/BOTs-Office-580881398736981/";
                messageData.attachment.payload.elements[m].image_url = mData[n].image.toString("utf8");
                //messageData.attachment.payload.elements[m].buttons[0].url = mData[n].link.toString("utf8");
                messageData.attachment.payload.elements[m].buttons[0].url = "http://movie.naver.com/movie/search/result.nhn?query=" + mTitle[n] + "&section=all&ie=utf8";
                messageData.attachment.payload.elements[m].buttons[1].payload += n;
                messageData.attachment.payload.elements[m].buttons[2].payload += n;
		//console.log(messageData.attachment.payload.elements[m].title);
	}
	//console.log(messageData);

	postMessageData(messageData);
}

// Send Message Data
function postMessageData(messageData){
	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:token},
		method: 'POST',
		json: {
			recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending message: ', error);
		} else if (response.body.error) {
			console.log('Error: ', response.body.error);
		}
	});// request end

}


//TODO complete posting
function postPage(messageData){

	console.log("postPage in\n");

        request({
                url: 'https://graph.facebook.com/v2.6/' + config.bot.page_id + '/feed',//"_" + sender + '/feed',
                qs: {access_token:token},
                method: 'POST',
         	message : {
               		message: messageData
 		}
	}, function(error, response, body) {
                if (error) {
                        console.log('Error sending message: ', error);
                } else if (response.body.error) {
                        console.log('Error: ', response.body.error);
                }
		console.log(body);

        });// request end

}



// Uses the Vision API to detect labels in the given file.
function detectLabels(inputFile, callback) {
	// Make a call to the Vision API to detect the labels
	vision.detectLabels(inputFile, function (error, labels) {
		if (error) {
			return callback(error);
	    	}
   		// console.log('result:', JSON.stringify(labels, null, 2));
   		// callback(null, labels);
	});
}


module.exports = router;
