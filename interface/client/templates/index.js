/**
Template Controllers

@module Templates
*/

/**
The body template

@class [template] body
@constructor
*/

Template.body.helpers({
    /**
    Chooses the view to render at start

    @method renderApp
    */
    'renderApp': function(){
        if(_.isEmpty(location.hash)) {
            return 'layout_main';
        }
        if(~location.hash.indexOf('#splashScreen')) {
            return 'popupWindows_splashScreen';
        }
        if(location.hash === '#requestAccountModal') {
            return 'popupWindows_requestAccount';
        }
    }
});