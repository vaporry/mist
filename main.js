global._ = require('underscore');
const app = require('app');  // Module to control application life.
const i18n = require('./modules/i18n.js');
const Minimongo = require('./modules/minimongoDb.js');
const syncMinimongo = require('./modules/syncMinimongo.js');


// GLOBAL Variables
global.production = false;
global.mode = 'mist';

global.path = {
    HOME: app.getPath('home'),
    APPDATA: app.getPath('appData')
};

global.language = 'en';
global.i18n = i18n; // TODO: detect language switches somehow

global.geth = null;
global.Tabs = Minimongo('tabs');


// INTERFACE PATHS
var interfaceAppUrl, interfacePopupsUrl;

// WALLET
if(global.mode === 'wallet') {
    interfaceAppUrl = (global.production)
        ? 'file://' + __dirname + '/interface/wallet/index.html'
        : 'http://localhost:3000';
    interfacePopupsUrl = (global.production)
        ? 'file://' + __dirname + '/interface/index.html'
        : 'http://localhost:3050';

// MIST
} else {
    interfaceAppUrl = interfacePopupsUrl = (global.production)
        ? 'file://' + __dirname + '/interface/index.html'
        : 'http://localhost:3000';
}



const BrowserWindow = require('browser-window');  // Module to create native browser window.
const ipc = require('ipc');
const ipcProviderBackend = require('./modules/ipc/ipcProviderBackend.js');
const menuItems = require('./menuItems');

var mainWindow = null;
var icon = __dirname +'/icons/'+ global.mode +'/icon.png';


// const getCurrentKeyboardLayout = require('keyboard-layout');
// const etcKeyboard = require('etc-keyboard');
// console.log(getCurrentKeyboardLayout());
// etcKeyboard(function (err, layout) {
//     console.log('KEYBOARD:', layout);
// });


// const Menu = require('menu');
// const Tray = require('tray');
// var appIcon = null;



// const processRef = global.process;
// process.nextTick(function() { global.process = processRef; });



// Report crashes to our server.
require('crash-reporter').start();


// Quit when all windows are closed.
app.on('window-all-closed', function() {
    // if (process.platform != 'darwin')
    app.quit();
});


// app.on('will-quit', function(event){
//     event.preventDefault()
// });

var killedSockets = false;
app.on('before-quit', function(event){
    if(!killedSockets)
        event.preventDefault();

    // CLEAR open IPC sockets to geth
    _.each(global.sockets, function(socket){
        if(socket) {
            console.log('Closing Socket ', socket.id);
            socket.destroy();
        }
    });


    // kill running geth
    if(global.geth)
        global.geth.kill('SIGKILL');

    // delay quit, so the sockets can close
    setTimeout(function(){
        killedSockets = true;
        app.quit();
    }, 500);
});

// Emitted when the application is activated while there is no opened windows.
// It usually happens when a user has closed all of application's windows and then
// click on the application's dock icon.
// app.on('activate-with-no-open-windows', function () {
//     if (mainWindow) {
//         mainWindow.show();
//     }
// });


// This method will be called when Electron has done everything
// initialization and ready for creating browser windows.
app.on('ready', function() {

    // instantiate custom protocols
    // require('./customProtocols.js');



    // appIcon = new Tray('./icons/icon-tray.png');
    // var contextMenu = Menu.buildFromTemplate([
    //     { label: 'Item1', type: 'radio' },
    //     { label: 'Item2', type: 'radio' },
    //     { label: 'Item3', type: 'radio', checked: true },
    //     { label: 'Item4', type: 'radio' },
    // ]);
    // appIcon.setToolTip('This is my application.');
    // appIcon.setContextMenu(contextMenu);


    // Create the browser window.

    // MIST
    if(global.mode === 'mist') {
        mainWindow = new BrowserWindow({
            show: false,
            width: 1024 + 208,
            height: 700,
            icon: icon,
            'standard-window': false,
            preload: __dirname +'/modules/preloader/mistUI.js',
            'node-integration': false,
            'web-preferences': {
                'overlay-fullscreen-video': true,
                'overlay-scrollbars': true,
                'webaudio': true,
                'webgl': true,
                'text-areas-are-resizable': true
            }
        });

        syncMinimongo(Tabs, mainWindow.webContents);


    // WALLET
    } else {

        mainWindow = new BrowserWindow({
            show: false,
            width: 1024,
            height: 680,
            icon: icon,
            'standard-window': false,
            'dark-theme': true,
            preload: __dirname +'/modules/preloader/wallet.js',
            'node-integration': false,
            'web-preferences': {
                'overlay-fullscreen-video': true,
                'overlay-scrollbars': true,
                'webaudio': true,
                'webgl': true,
                'text-areas-are-resizable': true,
                'web-security': false // necessary to make routing work on file:// protocol
            }
        });
    }


    var appStartWindow = new BrowserWindow({
            width: 400,
            height: 200,
            icon: icon,
            resizable: false,
            'node-integration': false,
            preload: __dirname +'/modules/preloader/splashScreen.js',
            'standard-window': false,
            'use-content-size': true,
            frame: false,
            'web-preferences': {
                'web-security': false // necessary to make routing work on file:// protocol
            }
        });
    appStartWindow.loadUrl(interfacePopupsUrl + '#splashScreen_'+ global.mode);//'file://' + __dirname + '/interface/startScreen/'+ global.mode +'.html');
    // appStartWindow.openDevTools();


    appStartWindow.webContents.on('did-finish-load', function() {

        // START GETH
        const checkNodeSync = require('./modules/checkNodeSync.js');
        const spawn = require('child_process').spawn;
        const getIpcPath = require('./modules/ipc/getIpcPath.js');
        const net = require('net');
        const socket = new net.Socket();
        var ipcPath = getIpcPath();
        var intervalId;
        var count = 0;


        // close app when X button is clicked
        ipc.on('closeApp', function() {
            app.quit();
        });


        // TRY to CONNECT
        setTimeout(function(){
            socket.connect({path: ipcPath});
        }, 1);

        // try to connect
        socket.on('error', function(e){
            // console.log('Geth connection REFUSED', count);

            // if no geth is running, try starting your own
            if(count === 0) {
                count++;

                // START GETH
                console.log('Starting Geth...');
                if(appStartWindow && appStartWindow.webContents)
                    appStartWindow.webContents.send('startScreenText', 'mist.startScreen.startingNode');

                var gethPath = __dirname + '/geth';

                if(global.production)
                    gethPath = gethPath.replace('app.asar/','');

                if(process.platform === 'win32')
                    gethPath += '.exe';

                global.geth = spawn(gethPath, [
                    // '-v', 'builds/pdf/book.html',
                    // '-o', 'builds/pdf/book.pdf'
                ]);
                global.geth.on('error',function(){
                    console.log('Coulnd\'nt start node binary');
                });
                // if we couldn't write to stdin, show binary error
                global.geth.stdin.on('error', function(){
                    if(appStartWindow && appStartWindow.webContents) {
                        appStartWindow.webContents.send('startScreenText', 'mist.startScreen.nodeBinaryNotFound');
                    }

                    clearInterval(intervalId);

                    clearSocket(socket, appStartWindow, ipcPath, true);
                });
                // type yes to the inital warning window
                setTimeout(function(){
                    global.geth.stdin.write("y\r\n");
                }, 10);
                // global.geth.stdout.on('data', function(chunk) {
                //     console.log('stdout',String(chunk));
                // });
                // global.geth.stderr.on('data', function(chunk) {
                //     console.log('stderr',String(chunk));
                // });


                // TRY TO CONNECT EVER 500MS
                intervalId = setInterval(function(){
                    socket.connect({path: ipcPath});
                    count++;

                    // timeout after 10 seconds
                    if(count >= 60) {

                        if(appStartWindow && appStartWindow.webContents)
                            appStartWindow.webContents.send('startScreenText', 'mist.startScreen.nodeConnectionTimeout', ipcPath);

                        clearInterval(intervalId);

                        clearSocket(socket, appStartWindow, ipcPath, true);
                    }
                }, 200);
            }
        });
        socket.on('connect', function(data){
            console.log('Geth connection FOUND');
            if(appStartWindow && appStartWindow.webContents) {
                if(count === 0)
                    appStartWindow.webContents.send('startScreenText', 'mist.startScreen.runningNodeFound');
                else
                    appStartWindow.webContents.send('startScreenText', 'mist.startScreen.startedNode');
            }

            clearInterval(intervalId);

            checkNodeSync(socket, appStartWindow, function(e){

                clearSocket(socket, appStartWindow, ipcPath);
                startMainWindow(mainWindow, appStartWindow);
            });
        });
    });

});


/**
Clears the socket

@method clearSocket
*/
var clearSocket = function(socket, appStartWindow, ipcPath, timeout){
    if(timeout) {
        // kill running geth
        if(global.geth)
            global.geth.kill('SIGKILL');
    }

    socket.removeAllListeners();
    socket.destroy();
    socket = null;
}


/**
Start the main window and all its processes

@method startMainWindow
*/
var startMainWindow = function(mainWindow, appStartWindow){

    // and load the index.html of the app.
    mainWindow.loadUrl(interfaceAppUrl);

    mainWindow.webContents.on('did-finish-load', function() {
        mainWindow.show();

        if(appStartWindow)
            appStartWindow.close();
        appStartWindow = null;
    });

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });


    // STARTUP PROCESSES

    ipc.on('mistAPI_requestAccount', function(e){
        var modalWindow = new BrowserWindow({
                width: 600,
                height: 400,
                icon: icon,
                show: false,
                'standard-window': false,
                preload: __dirname +'/modules/preloader/mistUI.js',
                'use-content-size': true,
                'node-integration': false,
                'web-preferences': {
                    'overlay-scrollbars': true,
                    'text-areas-are-resizable': false
                }
            });
        modalWindow.loadUrl(interfacePopupsUrl +'#requestAccountModal');
        modalWindow.webContents.on('did-finish-load', function() {
            modalWindow.show();
        });

    });


    // instantiate the application menu
    // ipc.on('setupWebviewDevToolsMenu', function(e, webviews){
    Tracker.autorun(function(){
        var webviews = Tabs.find({},{sort: {position: 1}, fields: {name: 1, _id: 1}}).fetch();
        menuItems(mainWindow, webviews || []);
    });

    // instantiate the application menu
    // ipc.on('setLanguage', function(e, lang){
    //     global.language = lang;

    // });

    // initialize the IPC provider on the main window
    ipcProviderBackend(mainWindow);
};