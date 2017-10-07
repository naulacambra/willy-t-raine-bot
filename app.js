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
        session.send("Welcome to the Will It Rain? checker.");
        builder.Prompts.text(session, "Please type the origin address...");
    },
    lookUpForAddress,
    function (session, results) {        
        session.userData.origin = session.userData.potentialAddresses[results.response.entity];
        builder.Prompts.text(session, "Please type the destination address...");
    },
    lookUpForAddress,
    function (session, results) {        
        session.userData.destination = session.userData.potentialAddresses[results.response.entity];
        console.log("UserData", session.userData)
        console.log("Origin", session.userData.origin)
        console.log("Destination", session.userData.destination)
        console.log("Origin", session.userData.origin.entity)
        console.log("Destination", session.userData.destination.entity)
        session.send("Selected options:\nOrigin: " + session.userData.origin.name +
            "\nDestination: " + session.userData.destination.name);

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
            if (response.data.routes.length > 0) {
                response.data.routes.forEach(function (route, index) {
                    session.send('Ruta número '+ index);
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
    
                    axios
                    .all(promises)
                    .then(function (results) {
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
            }
            else {
                session.send('There is not a route available');
            }
        })
        .catch(function (error) {
            console.log(error);
        });
    }
]);

function askForAddress (session, results) {
    builder.Prompts.text(session, results);
}
function lookUpForAddress (session, results) {
    axios.get(`${process.env.GOOGLE_MAPS_API_URL}/geocode/json`, {
        params: {
            key: process.env.GoogleMapsGeocodeApi,
            address: results.response,
            language: 'ca'
        }
    })
    .then((response) => {
        console.log("STEP: lookUpForAddress - then");
        session.userData.potentialAddresses = {};
        response.data.results.forEach((p) => {
            session.userData.potentialAddresses[p.formatted_address] = {
                name: p.formatted_address,
                geometry: p.geometry
            };
        });
        console.log("STEP: lookUpForAddress - before prompt choice");
        builder.Prompts.choice(session, "Which one do you mean?", session.userData.potentialAddresses, { listStyle: builder.ListStyle.button });
        console.log("STEP: lookUpForAddress - after prompt choice");
    });
}