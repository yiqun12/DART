const express = require('express');
const _ = require('lodash');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const bodyParser = require('body-parser');
const logger = require('morgan');
const errorHandler = require('errorhandler');
const lusca = require('lusca');
const dotenv = require('dotenv');
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
//multer is how we send files (like images) thru web forms
const multer = require('multer');
const csrf = require('csurf');
const fs = require('fs');
const util = require('util');
fs.readFileAsync = util.promisify(fs.readFile);
/*
 * Dependencies that were listed but don't appear to be used
 */
// const chalk = require('chalk');
// const compression = require('compression');
// var schedule = require('node-schedule');
// const aws = require('aws-sdk');


/*
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({ path: '.env' });

/*
aws.config.update({
  secretAccessKey: process.env.AWS_SECRET,
  accessKeyId: process.env.AWS_ACCESS,
  region: "us-east-2"
});
*/

//multer options for basic files
var m_options = multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: function(req, file, cb) {
        var prefix = req.user.id + Math.random().toString(36).slice(2, 10);
        cb(null, prefix + file.originalname.replace(/[^A-Z0-9]+/ig, "_"));
    }
});

//multer options for uploading a post (user created post)
var userpost_options = multer.diskStorage({
    destination: path.join(__dirname, 'uploads/user_post'),
    filename: function(req, file, cb) {
        var lastsix = req.user.id.substr(req.user.id.length - 6);
        var prefix = lastsix + Math.random().toString(36).slice(2, 10);
        cb(null, prefix + file.originalname.replace(/[^A-Z0-9]+/ig, "_"));
    }
});

//multer options for uploading a user profile image
var useravatar_options = multer.diskStorage({
    destination: path.join(__dirname, 'uploads/user_post'),
    filename: function(req, file, cb) {
        var prefix = req.user.id + Math.random().toString(36).slice(2, 10);
        cb(null, prefix + file.originalname.replace(/[^A-Z0-9]+/ig, "_"));
    }
});

//const upload = multer({ dest: path.join(__dirname, 'uploads') });
const upload = multer({ storage: m_options });
const userpostupload = multer({ storage: userpost_options });
const useravatarupload = multer({ storage: useravatar_options });


/*
 * Controllers (route handlers).
 */
const activityController = require('./controllers/activity');
const actorsController = require('./controllers/actors');
const scriptController = require('./controllers/script');
const classController = require('./controllers/class');
const userController = require('./controllers/user');
// Notifications not currently used in TestDrive.
// const notificationController = require('./controllers/notification');

/*
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');

// set up route middleware
var csrfProtection = csrf();

/*
 * Create Express server.
 */
const app = express();

/*
// Connect to MongoDB.

mongoose.Promise = global.Promise;

mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
mongoose.connect(process.env.PRO_MONGODB_URI || process.env.PRO_MONGOLAB_URI, { useNewUrlParser: true });
mongoose.connection.on('error', (err) => {
  console.error(err);
  console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
  process.exit();
});
*/

/*
 * Connect to MongoDB.
 */
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect(process.env.PRO_MONGODB_URI || process.env.PRO_MONGOLAB_URI);
mongoose.connection.on('error', (err) => {
    console.error(err);
    //console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
    process.exit();
});

/*
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
//We do compression on our production server using nginx as a reverse proxy
//app.use(compression());
/*
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public')
}));
*/
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
// Define our session.
app.use(session({
    resave: true,
    saveUninitialized: true,
    rolling: false,
    cookie: {
        path: '/',
        httpOnly: true,
        secure: false,
        maxAge: 1209600000,
        sameSite: 'lax'
    },
    secret: process.env.SESSION_SECRET,
    store: new MongoStore({
        url: process.env.PRO_MONGODB_URI || process.env.PRO_MONGOLAB_URI,
        autoReconnect: true,
        clear_interval: 3600
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//this allows us to no check CSRF when uploading an image. Its a weird issue that
//multer and lusca no not play well together
app.use((req, res, next) => {
    if ((req.path === '/api/upload') || (req.path === '/post/new') || (req.path === '/account/profile') || (req.path === '/account/signup_info_post') || (req.path === '/classes')) {
        //console.log("Not checking CSRF - out path now");
        //console.log("@@@@@request is " + req);
        //console.log("@@@@@file is " + req.file);
        //console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        next();
    } else {
        //lusca.csrf()(req, res, next);
        next();
    }
});

//secruity settings in our http header
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));

app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.use((req, res, next) => {
    // After successful login, redirect back to the intended page
    if (!req.user &&
        req.path !== '/login' &&
        req.path !== '//up' &&
        req.path !== '/bell' &&
        !req.path.match(/^\/auth/) &&
        !req.path.match(/\./)) {
        //console.log("@@@@@path is now");
        //console.log(req.path);
        req.session.returnTo = req.path;
    } else if (req.user &&
        req.path == '/account') {
        //console.log("!!!!!!!path is now");
        //console.log(req.path);
        req.session.returnTo = req.path;
    }
    next();
});

//var csrf = lusca({ csrf: true });

//helper function just to see what is in the body
function check(req, res, next) {
    // console.log("@@@@@@@@@@@@Body is now ");
    // console.log(req.body);
    next();
}

function addCsrf(req, res, next) {
    res.locals.csrfToken = req.csrfToken();
    next();
}

function setHttpResponseHeaders(req, res, next) {
    // TODO: rework chatbox so that 'unsafe-eval' in script-src is not required.
    res.set({
        'Cache-Control': 'no-cache, no-store',
        'Expires': '0',
        'Pragma': 'no-cache',
        'Content-Type': 'text/html; charset=UTF-8',
        'Content-Security-Policy': "script-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ http://cdnjs.cloudflare.com/ https://www.googletagmanager.com https://www.google-analytics.com;" +
            "default-src 'self' https://www.google-analytics.com;" +
            "style-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ https://fonts.googleapis.com;" +
            "img-src 'self' https://dhpd030vnpk29.cloudfront.net https://www.googletagmanager.com https://www.google-analytics.com;" +
            "media-src https://dhpd030vnpk29.cloudfront.net;" +
            "font-src 'self' https://fonts.gstatic.com  https://cdnjs.cloudflare.com/ data:"
    });
    next();
}

function isValidModId(req, res, next) {
    const modIds = [
        "trolls",
    ]
    if (modIds.includes(req.params.modId)) {
        next();
    } else {
        var err = new Error('Page Not Found.');
        err.status = 404;

        console.log(err);

        // set locals, only providing error stack in development
        err.stack = req.app.get('env') === 'development' ? err.stack : '';

        res.locals.message = err.message + " Oops! We can't seem to find the page you're looking for.";
        res.locals.error = err;

        // render the error page
        res.status(err.status);
        res.render('error');
    }
}

// All of our static files that express will automatically server for us.
// In production, we have nginx server this instead to take the load off out Node app
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use(express.static(path.join(__dirname, 'public2'), { maxAge: 31557600000 }));
app.use('/semantic', express.static(path.join(__dirname, 'semantic'), { maxAge: 31557600000 }));
app.use(express.static(path.join(__dirname, 'uploads'), { maxAge: 31557600000 }));
app.use(express.static(path.join(__dirname, 'post_pictures'), { maxAge: 31557600000 }));
app.use('/profile_pictures', express.static(path.join(__dirname, 'profile_pictures'), { maxAge: 31557600000 }));

const isResearchVersion = process.env.isResearchVersion === 'true';
const enableDataCollection = process.env.enableDataCollection === 'true';
const enableShareActivityData = process.env.enableShareActivityData === 'true';
const enableTeacherDashboard = process.env.enableTeacherDashboard === 'true';
const enableLearnerDashboard = process.env.enableLearnerDashboard === 'true';

/*
 * Primary app routes.
 * (In alphabetical order)
 */

function isValidModId(req, res, next) {
    const modIds = [
        "trolls",
    ]

    if (modIds.includes(req.params.modId)) {
        next();
    } else {
        var err = new Error('Page Not Found.');
        err.status = 404;

        console.log(err);

        // set locals, only providing error stack in development
        err.stack = req.app.get('env') === 'development' ? err.stack : '';

        res.locals.message = err.message + " Oops! We can't seem to find the page you're looking for.";
        res.locals.error = err;

        // render the error page
        res.status(err.status);
        res.render('error');
    }
}
// Main route is the module page
app.get('/', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('mods', {
        title: 'Pick a Lesson',
        isResearchVersion
    });
});

// Get current csrf token; COMMENTED OUT FOR NOW-- will work on it later
// app.get('/getCSRFToken', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
//     console.log(res.locals.csrfToken)
//     res.send(res.locals.csrfToken);
// });

// Render current user's account page, which is module specific (all modules)
app.get('/account/:modId', passportConfig.isAuthenticated, csrfProtection, setHttpResponseHeaders, addCsrf, isValidModId, userController.getAccount);

// Render end page (all modules)
app.get('/end/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render('base_end.pug', {
        title: 'Finished',
        modId: req.params.modId,
        isResearchVersion
    });
});


// Render intro page (all modules)
app.get('/intro/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === "delete") { // anticipating a specific user behavior that causes 500 errors
        res.redirect('/');
    } else {
        res.render('base_intro.pug', {
            title: 'Welcome'
        });
    }
});

// Render facilitator login page (all modules)
app.get('/facilitatorLogin', setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('facilitatorLogin.pug', {
        title: 'Facilitator Login'
    });
});

// Render facilitator login page (all modules)
app.get('/facilitatorHome', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('facilitatorHome.pug', {
        title: 'Facilitator Home'
    });
});

// Render student login page (all modules)
app.get('/studentLogin', setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('studentLogin.pug', {
        title: 'Student Login'
    });
});

// Render create student page (all modules)
app.get('/createStudent', setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('createStudent.pug', {
        title: 'Create Student'
    });
});

// Render user's profile page, which is module-specific.
app.get('/me/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, userController.getMe);

// Main route for rendering the free play page for a given module (only 'accounts' and 'privacy' modules do not have this page)
app.get('/modual/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, scriptController.getScript);

// Render privacy policy page.
app.get('/privacy', setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
    res.render('privacy_policy', {
        title: 'Privacy Policy'
    });
});

// Render the reflection page (all modules).
app.get('/results/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, async function(req, res) {
    let reflectionData;
    const data = await fs.readFileAsync(`${__dirname}/public2/json/reflectionSectionData.json`)
    reflectionData = JSON.parse(data.toString());

    res.render(req.params.modId + '/' + req.params.modId + '_results', {
        title: 'Reflection',
        reflectionData
    });
});

// Render the quiz page (all modules).
app.get('/quiz/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, async function(req, res) {
    let quizData;
    const data = await fs.readFileAsync(`${__dirname}/public2/json/quizSectionData.json`);
    quizData = JSON.parse(data.toString())[req.params.modId];

    res.render('base_quiz.pug', {
        title: 'Quiz',
        quizData,
    });
});

// Main route for rendering the practice page for a given module.
app.get('/sim/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === 'safe-posting') {
        res.set({
            'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ http://cdnjs.cloudflare.com/ https://www.googletagmanager.com https://www.google-analytics.com;" +
                "default-src 'self' https://www.google-analytics.com;" +
                "style-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ https://fonts.googleapis.com;" +
                "img-src 'self' https://dhpd030vnpk29.cloudfront.net https://www.googletagmanager.com https://www.google-analytics.com;" +
                "media-src https://dhpd030vnpk29.cloudfront.net;" +
                "font-src 'self' https://fonts.gstatic.com  https://cdnjs.cloudflare.com/ data:"
        });
    }
    res.render(req.params.modId + '/' + req.params.modId + '_sim', {
        title: 'Guided Activity'
    });
});

// Render page in the practice section
app.get('/sim1/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_sim1', {
        title: 'Guided Activity'
    });
});

// Render page in the practice section 
app.get('/sim2/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_sim2', {
        title: 'Guided Activity'
    });
});

// Render page in the practice section 
app.get('/sim3/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_sim3', {
        title: 'Guided Activity'
    });
});

// Render page in the practice section
app.get('/sim4/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_sim4', {
        title: 'Guided Activity'
    });
});


// Render start page (all modules)
app.get('/start/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === "delete") { // anticipating a specific user behavior that causes 500 errors
        res.redirect('/');
    } else {
        res.render(req.params.modId + '/' + req.params.modId + '_start', {
            title: 'Learn'
        });
    }
});

// Render transition review page
app.get('/trans/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_trans', {
        title: 'Review'
    });
});

// Render transition review page
app.get('/trans2/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_trans2', {
        title: 'Review'
    });
});

// Render transition review page
app.get('/trans_script/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_trans_script', {
        title: 'Review'
    });
});

// Main route for rendering the learn page for a given module
app.get('/tutorial/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === 'safe-posting') {
        res.set({
            'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ http://cdnjs.cloudflare.com/ https://www.googletagmanager.com https://www.google-analytics.com;" +
                "default-src 'self'  https://www.google-analytics.com;" +
                "style-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ https://fonts.googleapis.com;" +
                "img-src 'self' https://dhpd030vnpk29.cloudfront.net  https://www.googletagmanager.com https://www.google-analytics.com;" +
                "media-src https://dhpd030vnpk29.cloudfront.net;" +
                "font-src 'self' https://fonts.gstatic.com  https://cdnjs.cloudflare.com/ data:"
        });
    }
    res.render(req.params.modId + '/' + req.params.modId + '_tutorial', {
        title: 'Tutorial'
    });
});

// Render explore page
app.get('/Saeed_Ahmed/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === 'safe-posting') {
        res.set({
            'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ http://cdnjs.cloudflare.com/ https://www.googletagmanager.com https://www.google-analytics.com;" +
                "default-src 'self' https://www.google-analytics.com;" +
                "style-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ https://fonts.googleapis.com;" +
                "img-src 'self' https://dhpd030vnpk29.cloudfront.net https://www.googletagmanager.com https://www.google-analytics.com;" +
                "media-src https://dhpd030vnpk29.cloudfront.net;" +
                "font-src 'self' https://fonts.gstatic.com  https://cdnjs.cloudflare.com/ data:"
        });
    }
    res.render(req.params.modId + '/' + req.params.modId + '_Saeed_Ahmed', {
        title: 'Explore'
    });
});

app.get('/AmyG/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_AmyG', {
        title: 'Explore'
    });
});

app.get('/BlueLiveMatter1/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_BlueLiveMatter1', {
        title: 'Explore'
    });
});

// Render learn page 
app.get('/tutorial2/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    res.render(req.params.modId + '/' + req.params.modId + '_tutorial2', {
        title: 'Tutorial'
    });
});

// Render tutorial guide page
app.get('/tut_guide/:modId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, isValidModId, function(req, res) {
    if (req.params.modId === 'safe-posting') {
        res.set({
            'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ http://cdnjs.cloudflare.com/  https://www.googletagmanager.com https://www.google-analytics.com;" +
                "default-src 'self' https://www.google-analytics.com;" +
                "style-src 'self' 'unsafe-inline' https://dhpd030vnpk29.cloudfront.net https://cdnjs.cloudflare.com/ https://fonts.googleapis.com;" +
                "img-src 'self' https://dhpd030vnpk29.cloudfront.net  https://www.googletagmanager.com https://www.google-analytics.com;" +
                "media-src https://dhpd030vnpk29.cloudfront.net;" +
                "font-src 'self' https://fonts.gstatic.com  https://cdnjs.cloudflare.com/ data:"
        });
    }
    res.render(req.params.modId + '/' + req.params.modId + '_tut_guide', {
        title: 'Tutorial'
    });
});

// Render the profile page for the given actor
app.get('/user/:userId', passportConfig.isAuthenticated, csrfProtection, setHttpResponseHeaders, addCsrf, actorsController.getActor);

/*
 * Account creation & deletion
 */
// Delete guest account, or feedAction of account
app.post('/delete', passportConfig.isAuthenticated, setHttpResponseHeaders, userController.getDeleteAccount);
// Create a new guest account
app.get('/guest/:modId', setHttpResponseHeaders, isValidModId, userController.getGuest);

/*
 * Logins (only used on research site)
 */
if (isResearchVersion) {
    app.get('/login', csrfProtection, setHttpResponseHeaders, addCsrf, userController.getLogin);
    app.get('/classLogin/:accessCode', csrfProtection, setHttpResponseHeaders, addCsrf, userController.getClassLogin);
    app.post('/instructorLogin', check, setHttpResponseHeaders, csrfProtection, userController.postInstructorLogin);
    app.post('/facilitatorLogin', check, setHttpResponseHeaders, csrfProtection, userController.postFacilitatorLogin);
    app.post('/studentLogin', check, setHttpResponseHeaders, csrfProtection, userController.postStudentLogin);
    app.post('/createStudent', check, setHttpResponseHeaders, csrfProtection, userController.postCreateStudent);
    // app.post('/studentLogin/:accessCode', check, setHttpResponseHeaders, csrfProtection, userController.postStudentLogin);
    app.get('/logout', setHttpResponseHeaders, csrfProtection, addCsrf, userController.logout);
}

/*
 * Key functionalities
 */
// Post a new user-created post
app.post('/post/new', check, setHttpResponseHeaders, csrfProtection, scriptController.newPost);
// Post information about a user action on a post in a freeplay feed section
app.post('/feed', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postUpdateFeedAction);
// Delete all recorded feed actions for the current user - currently not used
app.post('/deleteUserFeedActions', passportConfig.isAuthenticated, setHttpResponseHeaders, scriptController.postDeleteFeedAction);
// Post information about a user's reflection answers in the reflection section 
app.post('/reflection', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postReflectionAction);
// Post information about a user's quiz answers in the quiz section
app.post('/quiz', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postQuizAction);
app.post('/postViewQuizExplanations', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postViewQuizExplanations);
// Record user's topic selection for modules with customized freeplay content
app.post('/interest', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postUpdateInterestSelection);
app.post('/advancedlitInterest', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postAdvancedlitInterestSelection);
// Routes to get topic selections for modules with customized freeplay content
app.get('/esteemTopic', passportConfig.isAuthenticated, setHttpResponseHeaders, userController.getEsteemTopic);
app.get('/advancedlitTopic', passportConfig.isAuthenticated, setHttpResponseHeaders, userController.getAdvancedlitTopic);
// This was for load testing - not sure if it should be deleted
app.get('/testing/:modId', isValidModId, scriptController.getScriptFeed);
// Update user profile information
app.post('/account/profile', passportConfig.isAuthenticated, useravatarupload.single('picinput'), check, setHttpResponseHeaders, csrfProtection, userController.postUpdateProfile);
app.post('/account/profile/:modId', passportConfig.isAuthenticated, useravatarupload.single('picinput'), check, setHttpResponseHeaders, csrfProtection, userController.postUpdateProfile);

/*
 * Recording various user activities if data collection is enabled
 */
if (enableDataCollection) {
    app.post('/pageLog', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postPageLog);
    app.post('/startPageAction', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postStartPageAction);
    app.post('/introjsStep', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postIntrojsStepAction);
    app.post('/bluedot', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postBlueDotAction);
    app.post('/moduleProgress', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postUpdateModuleProgress);
    app.post('/accountsAction', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postUpdateUniqueFeedAction);
    app.post('/habitsAction', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postUpdateUniqueFeedAction);
    app.post('/privacyAction', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postUpdateUniqueFeedAction);
    app.post('/chatAction', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, scriptController.postUpdateChatAction);
    app.post('/voiceoverTimer', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postUpdateVoiceoverTimer);
}

/*
 * Recording specific user activities if the user selects to share their activity data
 */
if (enableShareActivityData) {
    app.post('/postActivityData', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, activityController.postActivityData);
    app.post('/postDeleteActivityData', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, activityController.postDeleteActivityData);
}

/*
 * Teacher dashboard
 */
if (enableTeacherDashboard) {
    app.get('/classIdList', passportConfig.isAuthenticated, setHttpResponseHeaders, classController.getClassIdList);
    app.get('/classManagement', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClasses);
    app.get('/viewClass/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClass);
    app.get('/classSize/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClassSize);
    app.get('/classUsernames/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClassUsernames);
    app.get('/classPageTimes/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClassPageTimes);
    app.get('/classPageTimes/:classId/:modName', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, classController.getClassPageTimes);
    app.get('/moduleProgress/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, classController.getModuleProgress);
    app.get('/classReflectionResponses/:classId', passportConfig.isAuthenticated, setHttpResponseHeaders, classController.getReflectionResponses);
    app.get('/classFreeplayActions/:classId/:modName', passportConfig.isAuthenticated, setHttpResponseHeaders, classController.getClassFreeplayActions);
    app.get('/studentReportData/:classId/:username', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, userController.getStudentReportData);
    app.get('/singlePost/:postId', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, scriptController.getSinglePost);
    app.post('/downloadReflectionResponses/:classId/:modName', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.postClassReflectionResponsesCsv);
    app.post('/postClassTimeReportCsv/:classId/:modName', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.postClassTimeReportCsv);
    app.post('/createNewClass', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.postCreateClass);
    app.post('/deleteClass', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.postDeleteClass);
    app.post('/removeStudentFromClass', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.removeStudentFromClass);
    app.post('/generateStudentAccounts', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, classController.generateStudentAccounts);
    app.post('/updateName', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postName);

    // The class overview page on the teacher dashboard
    app.get('/classOverview', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('teacherDashboard/classOverview', {
            title: 'Class Overview'
        });
    });

    // The module overview page on the teacher dashboard
    app.get('/moduleOverview', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('teacherDashboard/moduleOverview', {
            title: 'Module Overview'
        });
    });

    // The student report page on the teacher dashboard
    app.get('/studentReport', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('teacherDashboard/studentReport', {
            title: 'Student Report'
        });
    });
}

/*
 * Learner dashboard
 */
if (enableLearnerDashboard) {
    app.get('/getLearnerGeneralModuleData', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, userController.getLearnerGeneralModuleData);
    app.get('/getLearnerSectionTimeData', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, userController.getLearnerSectionTimeData);
    app.get('/getLearnerEarnedBadges', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, userController.getLearnerEarnedBadges);
    app.post('/postUpdateNewBadge', passportConfig.isAuthenticated, check, setHttpResponseHeaders, csrfProtection, userController.postUpdateNewBadge);

    // The learning achievement page on the learner dashboard
    app.get('/learningAchievement', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('learnerDashboard/learningAchievement', {
            title: 'My Learning Achievement'
        });
    });

    // The learning map page on the learner dashboard
    app.get('/learningMap', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('learnerDashboard/learningMap', {
            title: 'Learning Map'
        });
    });

    // The module completion page on the learner dashboard
    app.get('/moduleCompletion', passportConfig.isAuthenticated, setHttpResponseHeaders, csrfProtection, addCsrf, function(req, res) {
        res.render('learnerDashboard/moduleCompletion', {
            title: 'Module Completion'
        });
    });
}

/*
 * Error Handler.
 */
// Commented out: Do not have to use https://www.npmjs.com/package/errorhandler for local development
// if (process.env.instanceType === 'test'){
//   app.use(errorHandler()); 
// }
//  else {

// error handler
// COMMENTED OUT FOR NOW -- WILL WORK ON IT LATER; error handler for csrf invalid id error
// app.use(function(err, req, res, next) {
//     if (err.code !== 'EBADCSRFTOKEN') return next(err)

//     // handle CSRF token errors here
//     console.log("CSRF TOKEN ERROR");
//     console.log(err);
//     addCsrf();
//     console.log(res.locals.csrfToken);
//     // res.method = 'GET';
//     // res.url = '/getCSRFToken';
//     // res.send();
//     // // if (jqXHR.status === 403 && jqXHR.responseText.includes('invalid csrf token')) {
//     // const newCsrf = $.get("/getCSRFToken");
//     // //     _logStartPageAction(cat, newCsrf, --retryCount);
//     // // }
//     // console.log(res.locals.csrfToken);
//     // console.log(newCsrf)
//     res.send({ method: 'GET', url: ['/getCSRFToken'] });
// })

// error handler
app.use(function(err, req, res, next) {
    // No routes handled the request and no system error, that means 404 issue.
    // Forward to next middleware to handle it.
    if (!err) return next();

    console.error(err);

    // set locals, only providing error stack and message in development
    // Express app.get('env') returns 'development' if NODE_ENV is not defined
    err.status = err.status || 500;
    err.stack = req.app.get('env') === 'development' ? err.stack : '';
    err.message = req.app.get('env') === 'development' ? err.message : " Oops! Something went wrong.";

    res.locals.message = err.message;
    res.locals.error = err;

    // render the error page
    res.status(err.status);
    res.render('error');
});

// catch 404. 404 should be considered as a default behavior, not a system error.
// Necessary to include because in express, 404 responses are not the result of an error, so the error-handler middleware will not capture them. https://expressjs.com/en/starter/faq.html 
app.use(function(req, res, next) {
    var err = new Error('Page Not Found.');
    err.status = 404;

    console.log(err);

    // set locals, only providing error stack in development
    err.stack = req.app.get('env') === 'development' ? err.stack : '';

    res.locals.message = err.message + " Oops! We can't seem to find the page you're looking for.";
    res.locals.error = err;

    // render the error page
    res.status(err.status);
    res.render('error');
});
// }

/*
 * Start Express server.
 */
app.listen(app.get('port'), () => {
    // console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
    console.log('  Press CTRL-C to stop\n');
});

module.exports = app;