/*!
 * Platform JavaScript SDK
 * Copyright (c) 2011, Ian McDaniel
 * For all api documentation:
 * http://github.com/berk/platform_js_clientsdk
 */

;(function(){

	// The Platform namespace
	var Platform = {
		
		// current version
		Version: '0.2.0',
		
		_appid 		: null,
		_status 	: null, // unknown, authorized or unauthorized
		_logging	: false,
		_cookies	: false,
		_access_token :null,
		_host : 'http://localhost:3000',  // change the host to your server url
		_url: {
			api				: '/api',
			status		: '/oauth/status',
			connect		: '/oauth/authorize',
			disconnect:	'/oauth/deauthorize',
			logout		: '/oauth/logout'
		},
		
		// creates a quick and dirty unique id for use in callbacks
		uuid:function() {
			return 'g' + (((1+Math.random())*0x10000)|0).toString(16).substring(1);
		},
		
		// log messages for debugging, off by default
		log:function() {
			if(this._logging) {
				var args = Array.prototype.slice.call(arguments, 0) || [];
				if (window.console) window.console.log.apply(window.console,args);
				if (Platform.Event) Platform.Event.trigger.apply(Platform.Event,['log'].concat(args));
			}
		},
		
		// Initialize the Platform SDK library
		// The best place to put this code is right before the closing </body> tag
		//      
		//   Platform.init({
		//   	 appId  			: 'YOUR APP KEY',							// app id or app key
		//	   access_token : 'YOUR ACCESS TOKEN',				// set the access token if you already have it
		//   	 host 				: 'http://localhost:3000', 	  // change host to your server
		//   	 cookies 			: true,												// enable cookies to allow the server to access the session
		//		 logging  		: true												// enable log messages to help in debugging
		//   });
		//
		init:function(opts,cb) {
			opts || (opts = {});
			if(!opts.app_id) {
				return Platform.log('Platform Javascript SDK requires an Application ID');
			}
			this._appid 		= opts.app_id;
			
			// authorize app if we already have an access token
			if(opts.access_token) {
				this._access_token 	= opts.access_token;
				this._status				= "authorized";
			}
			
			this._logging 	= (window.location.toString().indexOf('Platform_debug=1') > 0)  || opts.logging || this._logging;
			this._cookies 	= opts.cookies 	|| this._cookies;
			this._host 			= opts.host 		|| this._host;
			return this;
		}

	}
	
	// Helper methods to make things easier
	Platform.Util = {
	
		// Extend an object with all the properties of the passed object
		extend:function extend(destination, source) {
			for (var property in source) 
				destination[property] = source[property];
			return destination;
		},
		
		// Create a URL-encoded query string from an object
		encodeQueryString:function(obj,prefix){
			var str = [];
			for(var p in obj) str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
			return str.join("&");
		},
		
		// Parses a query string and returns an object composed of key/value pairs
		decodeQueryString:function(qs){
			var
				obj = {},
				segments = qs.split('&'),
				kv;
			for (var i=0; i<segments.length; i++) {
				kv = segments[i].split('=', 2);
				if (kv && kv[0]) {
					obj[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
				}
			}
			return obj;
		}
	
	}
	
  //  Platform custom events. You may 'bind' or 'unbind' a callback function to an event;
  // 'triggering'-ing an event fires all callbacks in succession.
  //
  //		function showStatus(status){
  //			alert(status)
  //		}
  //    Platform.Event.bind('auth:statusChange', showStatus);
  //    Platform.Event.trigger('auth:statuschange','authorized');
  //		Platform.Event.unbind('auth:statusChange', showStatus);
  //
	Platform.Event = {

		_events:{},

		// Bind an event, specified by a string name, 'event', to a callback, 'cb', function.
		bind: function(event, cb){
			this._events[event] = this._events[event]	|| [];
			this._events[event].push(cb);
		},
		
		// Remove one or many callbacks. If callback is null, all
    // callbacks for the event wil be removed.
		unbind: function(event, cb){
			if(event in this._events === false)	return;
			this._events[event].splice(this._events[event].indexOf(cb), 1);
			if(!cb) delete this._events[event];
		},
		
		// Trigger an event, firing all bound callbacks. Callbacks are passed the
    // same arguments as 'trigger' is, apart from the event name.
		trigger: function(event){
			if( event in this._events === false  )	return;
			for(var i = 0; i < this._events[event].length; i++){
				this._events[event][i].apply(this, Array.prototype.slice.call(arguments, 1))
			}
		}
	
	}

  //  APIs for making requests against Platform's Server. 
	//	All request types take the same arguments; url, parameters and a callback.
  //	

	Platform.Request = {
		
		
		callbacks : {},
		
		// Standard JSONP request
		//
		// 		Platform.Request.jsonp(url[, paramerters, callback])
		//
		jsonp:function(url,params,cb) {
			var 
				self = this,
				script 	= document.createElement('script'),
				uuid		= Platform.uuid(),
				params 	= Platform.Util.extend((params||{}),{callback:'Platform.Request.callbacks.' + uuid}),
				url 		= url + (url.indexOf('?')>-1 ? '&' : '?') + Platform.Util.encodeQueryString(params);

			this.callbacks[uuid] = function(data) {
				if(data.error) {
					Platform.log([data.error,data.error_description].join(' : '));
				}
				if(cb) cb(data);
				delete self.callbacks[uuid];
			}
			script.src = url;
			document.getElementsByTagName('head')[0].appendChild(script);
		},
		
  	// Same as a jsonp request but with an access token for oauth authentication
  	//
		// 		Platform.Request.oauth(url[, paramerters, callback])
		//
		oauth:function(url,params,cb) {
			params || (params = {});
			if(Platform._access_token) {
				Platform.Util.extend(params,{access_token:Platform._access_token});
			} else {
				Platform.log('Platform.Request.oauth() called without an access token.');
			}
			this.jsonp(url,params,cb);
		},

  	// Opens a popup window with the given url and places it at the
   	// center of the current window. Used for app authentication. Should only 
   	// be called on a user event like a click as many browsers block popups 
   	// if not initiated by a user. 
  	//
		// 		Platform.Request.popup(url[, paramerters, callback])
		//
		popup: function(url,params,cb) {
			this.registerXDHandler();
			// figure out where the center is
			var
				screenX    	= typeof window.screenX != 'undefined' ? window.screenX : window.screenLeft,
				screenY    	= typeof window.screenY != 'undefined' ? window.screenY : window.screenTop,
				outerWidth 	= typeof window.outerWidth != 'undefined' ? window.outerWidth : document.documentElement.clientWidth,
				outerHeight = typeof window.outerHeight != 'undefined' ? window.outerHeight : (document.documentElement.clientHeight - 22),
				width    		= params.width 	|| 600,
				height   		= params.height || 400,
				left     		= parseInt(screenX + ((outerWidth - width) / 2), 10),
				top      		= parseInt(screenY + ((outerHeight - height) / 2.5), 10),
				features = (
					'width=' + width +
					',height=' + height +
					',left=' + left +
					',top=' + top
				);
			var 
				uuid		= Platform.uuid(),
				params 	= Platform.Util.extend((params||{}),{
					callback	: uuid,
					display		: 'popup',
					origin		: this._origin()
				}),
				url 		= url + (url.indexOf('?')>-1 ? '&' : '?') + Platform.Util.encodeQueryString(params);
			var win = window.open(url,uuid,features);
			this.callbacks[uuid] = function(data) {
				if(cb) cb(data,win);
				delete Platform.Request.callbacks[uuid];
			}
		},

  	// Creates and inserts a hidden iframe with the given url then removes 
  	// the iframe from the DOM
  	//
		// 		Platform.Request.hidden(url[, paramerters, callback])
		//
		hidden:function(url,params,cb) {
			this.registerXDHandler();
			var 
				iframe 	= document.createElement('iframe'),
				uuid		= Platform.uuid(),
				params 	= Platform.Util.extend((params||{}),{
					callback	: uuid,
					display		: 'hidden',
					origin		: this._origin()
				}),
				url 		= url + (url.indexOf('?')>-1 ? '&' : '?') + Platform.Util.encodeQueryString(params);
				
			iframe.style.display = "none";
			this.callbacks[uuid] = function(data) {
				if(cb) cb(data);
				delete Platform.Request.callbacks[uuid];
				iframe.parentNode.removeChild(iframe);
			}
			iframe.src = url;
			document.getElementsByTagName('body')[0].appendChild(iframe);
		},
		
		
		// Make sure we're listening to the onMessage event
		registerXDHandler:function() {
			if(this.xd_registered) return;
			var 
				self=Platform.Request,
				fn = function(e){Platform.Request.onMessage(e)}
			window.addEventListener
				? window.addEventListener('message', fn, false)
				: window.attachEvent('onmessage', fn);
			this.xd_registered = true;
		},
	
		// handles message events sent via postMessage, and fires the appropriate callback
		onMessage:function(e) {
			var data = {};
			if (e.data && typeof e.data == 'string') {
				data = Platform.Util.decodeQueryString(e.data);
			}
			
			if(data.error) {
				Platform.log(data.error,data.error_description);
			}
			
			if(data.callback) {
				var cb = this.callbacks[data.callback];
				if(cb) {
					cb(data);
					delete this.callbacks[data.callback];
				}
			}
		},
		
		// get the origin of the page
		_origin: function() {
			return (window.location.protocol + '//' + window.location.host)
		}
		


	}
	
	
	// Authentication
	
	Platform.Auth = {
		
		// Returns the current authentication status of the user from the server, and provides
		// an access token if the user is logged into Platform and has authorized the app.
		//
		// 		Platform.Auth.getStatus(function(response){
		//			if(response.status == 'authorized') {
		//				// User is logged in and has authorized the app
		//			}
		//		})
		//
		// The status returned in the response will be either 'authorized', user is logged in
		// and has authorized the app, 'unauthorized', user is logged in but has not authorized 
		// the app and 'unknown', user is not logged in.
		
		getStatus:function(cb) {
			if(!Platform._appid) {
				return Platform.log('Platform.Auth.getStatus() called without an app id');
			}
			var url = Platform._host + Platform._url.status;
			Platform.Request.hidden(url,{client_id:Platform._appid},function(data){
				Platform.Auth.setStatus(data);
				if(cb) cb(data);
			});
		},
		
		// Launches the authorization window to connect to Platform and if successful returns an
		// access token.
		//
		// 		Platform.Auth.connect(function(response){
		//			if(response.status == 'authorized') {
		//				// User is logged in and has authorized the app
		//			}
		//		})
		//
		
		connect:function(cb) {
			if(!Platform._appid) {
				return Platform.log('Platform.Auth.connect() called without an app id.');
			}
			if(!Platform._access_token) {
				var url = Platform._host + Platform._url.connect,
					params = {
						response_type	: 'token',
						client_id			: Platform._appid
					};
				Platform.Request.popup(url,params,function(data,win){
					Platform.Auth.setStatus(data);
					if(win) win.close();
					if(cb) cb(data);
				});
			} else {
				Platform.log('Platform.Auth.connect() called when user is already connected.');
				if(cb) cb();
			}
		},
		
		// Revokes your apps authorization access
		//
		// 		Platform.Auth.disconnect(function(){
		//			// App authorization has been revoked
		//		})
		//
		disconnect:function(cb) {
			if(!Platform._appid) {
				return Platform.log('Platform.Auth.disconnect() called without an app id.');
			}
			var url = Platform._host + Platform._url.disconnect;
			Platform.Request.jsonp(url,{client_id:Platform._appid},function(r){
				Platform.Auth.setStatus(null);
				if(cb) cb(r);
			})
		},
		
		
		// Logs the user out of Platform
		//
		// 		Platform.Auth.logout(function(){
		//			// App authorization has been revoked
		//		})
		//
		logout:function(cb) {
			if(!Platform._appid) {
				return Platform.log('Platform.Auth.logout called() without an app id.');
			}
			var url = Platform._host + Platform._url.logout;
			Platform.Request.jsonp(url,{client_id:Platform._appid},function(r){
				Platform.Auth.setStatus(null);
				if(cb) cb(r);
			});
		},
		
		// Determines the correct status ('unknown', 'unauthorized' or 'authorized') and 
		// sets the access token if authorization is approved.
		setStatus:function(data) {
			data || (data = {});
			if(data.access_token) {
				Platform._access_token = data.access_token;
				Platform.Cookie('Platform'+Platform._appid, Platform._access_token);
				data.status = "authorized";
			} else {
				Platform._access_token = null;
				Platform.Cookie('Platform'+Platform._appid, null);
				data.status = data.status || "unknown";
			}
			if(Platform._status != data.status) {
				Platform.Event.trigger('auth:statusChange',data.status);
			}
			return (Platform._status = data.status);
		}
	
	}
	
	// Make API calls to Platform's Servers
	//
	// The API strives to provide consistent access to PlatformÃ¢â‚¬â„¢s data. IDs are embedded before 
	// the action so the urls read more like a sentence. To get all profile 1Ã¢â‚¬â„¢s tree matches 
	// you would request 
	//
	//			Platform.api('/profile-1/tree-matches',function(data){
	//				// returns a list of tree matches for profile with id 1
	//			}) 
	//
	// Omitting the ids in urls implies the action should be applied to the current userÃ¢â‚¬â„¢s data. 
	// For example, 
	//
	//			Platform.api('/profile',function(data) {
	//				// returns current user's profile data
	//			})
	//
	// will return the profile information for the logged in user. Parameters can optionally be 
	// passed in as the second argument:
	//
	//			Platform.api('/profile-101',{fields:'first_name,last_name'},function(data) {
	//				// only returns first and last name of profile with id 101
	//			})
  // 
  // Visit htp://dev.Platform.com for more detailed documentation.
  //
	Platform.Api = {
	
		// Makes an oauth jsonp request to Platform's servers for data.
		//
		// 		Platform.Api.get('/user',function(data){
		//			// do something awesome with Platform data
		//		})
		//
		get:function(path,params,cb) {
			if(typeof params == 'function') {
				cb = params;
				params = {};
			}	
			params || (params = {});
			if(params.method) {
				params['_method'] = params.method;
				delete params.method;
			}
    	path = Platform._host + Platform._url.api + "/" + path.replace(/^\//,'');
    
	    Platform.Request.oauth(path, params, cb);
		},
		
		
		// Makes an oauth jsonp request to Platform's servers to save data. All jsonp
		// requests use a GET method but we can get around this by adding a 
		// _method=post parameter to our request.
		//
		// 		Platform.Api.post(function(data){
		//			// Add awesome data to Platform
		//		})
		//
		post:function(path,params,cb) {
			params = Platform.Util.extend({'_method':'post'},params || {});
			this.get(path,params,cb);
		}
		
	}

	// Cookies
	// Helper function to get/set browser cookies so an application's server can have access
	// to the access token.
	//
	Platform.Cookie = function (key, value, options) {
		if(!Platform._cookies) return;
    if (arguments.length > 1 && String(value) !== "[object Object]") {
			options = Platform.Util.extend({}, options);
			if (value === null || value === undefined) options.expires = -1;
			if (typeof options.expires === 'number') {
				var days = options.expires, t = options.expires = new Date();
				t.setDate(t.getDate() + days);
			}
			value = String(value);
			return (document.cookie = [
				encodeURIComponent(key), '=',
				options.raw 		? value : encodeURIComponent(value),
				options.expires ? '; expires=' + options.expires.toUTCString() : '',
				options.path 		? '; path=' + options.path : '',
				options.domain 	? '; domain=' + options.domain : '',
				options.secure 	? '; secure' : ''
			].join(''));
    }
    options = value || {};
    var result, decode = options.raw ? function (s) { return s; } : decodeURIComponent;
    return (result = new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)').exec(document.cookie)) ? decode(result[1]) : null;
	}
	
	
	// shortcuts to make things easier
	window.Platform = window.$g = Platform.Util.extend(Platform,{
		getStatus		: Platform.Auth.getStatus,
		connect			: Platform.Auth.connect,
		disconnect	: Platform.Auth.disconnect,
		logout			: Platform.Auth.logout,
		api					: Platform.Api.get 					//most api calls are gets
	});

}).call(this);

