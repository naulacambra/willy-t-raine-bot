/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var fs = require('fs');
var axios = require('axios');

var googleMapsApi = axios.create({
    baseURL: process.env.GOOGLE_MAPS_API_URL
});

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

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, [
    function (session) {
        session.routes = '';
        session.send("Welcome to the route rain checker.");
        session.beginDialog('ask-for-origin');
    },
    function (session, results) {
        console.debug("Origin", results.response)
        session.dialogData.reservationDate = builder.EntityRecognizer.resolveTime([results.response]);
        session.beginDialog('askForPartySize');
    },
    function (session, results) {
        session.dialogData.partySize = results.response;
        session.beginDialog('askForReserverName');
    },
    function (session, results) {
        session.dialogData.reservationName = results.response;

        // Process request and display reservation details
        session.send(`Reservation confirmed. Reservation details: <br/>Date/Time: ${session.dialogData.reservationDate} <br/>Party size: ${session.dialogData.partySize} <br/>Reservation name: ${session.dialogData.reservationName}`);
        session.endDialog();
    }
]);

// Dialog to ask for a date and time
bot.dialog('ask-for-origin', [
    function (session) {
        builder.Prompts.text(session, "Please the origin address...");
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
             var possible_addresses = response.data.results.reduce((sum, result) => {
                 return Object.assign({}, sum, {
                     [result.formatted_address]: {
                         name: result.formatted_address,
                         geometry: result.geometry,
                     }
                 });
             }, {});
             console.log('debugging', response.data);
             builder.Prompts.choice(session, "Which one do you mean?", possible_addresses, { listStyle: builder.ListStyle.button }); 
         });
    },
    function (session, results) {
        session.endDialogWithResult(results);
    }
]);

// Dialog to ask for number of people in the party
bot.dialog('askForPartySize', [
    function (session) {
        builder.Prompts.text(session, "How many people are in your party?");
    },
    function (session, results) {
        session.endDialogWithResult(results);
    }
])

// Dialog to ask for the reservation name.
bot.dialog('askForReserverName', [
    function (session) {
        builder.Prompts.text(session, "Who's name will this reservation be under?");
    },
    function (session, results) {
        session.endDialogWithResult(results);
    }
]);
