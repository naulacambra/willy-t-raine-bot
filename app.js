/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var fs = require('fs');
var axios = require('axios');
var _ = require('lodash');

var googleMapsApi = axios.create({
    baseURL: process.env.GOOGLE_MAPS_API_URL
});

// Load environment variables from local if .env file exists
if (fs.existsSync('.env')) {
    var dotenv = require('dotenv');
    dotenv.config();
}

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    stateEndpoint: process.env.BotStateEndpoint,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, [
    function (session) {
        session.routes = '';
        session.send("Welcome to the route rain checker.");
        session.beginDialog('ask-for-address', "Please type the origin address...");
    },
    function (session, results) {
        session.userData.origin = results;
        session.beginDialog('ask-for-address', "Please type the destination address...");
    },
    function (session, results) {
        session.userData.destination = results;
        session.send("Selected options:\nOrigin: " + session.userData.origin.name +
            "\nDestination: " + session.userData.destination.name);

            // TESTING
            // session.userData.origin.name = "Barcelona, Espanya";
            // session.userData.destination.name = "Madrid, Espanya";
            // END TESTING

        var codeBadGroupsStarts = [2, 3, 5, 6, 7, 9];

        axios.get(`${process.env.GOOGLE_MAPS_API_URL}/directions/json`, {
            params: {
                origin: session.userData.origin.name,
                destination: session.userData.destination.name,
                mode: 'driving',
                key: process.env.GoogleMapsGeocodeApi
            }
        })
        .then(function (response) {
            //Recorremos tods las rutas
            response.data.routes.forEach(function (route, indx) {
                session.send('Runta número '+indx);
                var lluviaEnLaRuta = [],
                    promises = [];
                route.legs.forEach(function (leg) { //Solo debería haber uno
                    leg.steps.forEach(function (step) {
                        /**
                        * LLamada a weather
                        */
                        promises.push(axios.get(`${process.env.WEATHER_API_URL}/weather`, {
                        params: {
                                APPID: process.env.WEATHER_API_KEY,
                                lat: step.start_location.lat,
                                lon: step.start_location.lng
                            }
                    }));
            });
        });

        axios.all(promises).then(function (results) {
            results.forEach(function (response) {
                var id = response.data.weather[0].id;
                var test = !_.isEmpty(_.filter(codeBadGroupsStarts, function (code) {
                    return _.startsWith(id, code);
                }));

                lluviaEnLaRuta.push(test);
            });

            session.send('Va ha llover: '+_.includes(lluviaEnLaRuta, true))
        })
            .catch(function (error) {
                console.log(error);
            });

        });
        })
        .catch(function (error) {
            console.log(error);
        });
    }
]);

// Dialog to ask for a date and time
bot.dialog('ask-for-address', [
    function (session, results) {
        builder.Prompts.text(session, results);
    },
    function (session, results) {
        axios.get(`${process.env.GOOGLE_MAPS_API_URL}/geocode/json`, {
            params: {
                key: process.env.GoogleMapsGeocodeApi,
                address: results.response,
                language: 'ca'
            }
        })
            .then((response) => {
                session.userData.potentialAddresses = {};
                response.data.results.forEach(function (p) {
                    session.userData.potentialAddresses[p.formatted_address] = {
                        name: p.formatted_address,
                        geometry: p.geometry
                    };
                }, this);
                builder.Prompts.choice(session, "Which one do you mean?", session.userData.potentialAddresses, { listStyle: builder.ListStyle.button });
            });
    },
    function (session, results) {
        console.log("Session addresses", session.userData.potentialAddresses);
        session.endDialogWithResult(session.userData.potentialAddresses[results.response.entity]);
    }
]);