#PlexNotifier.js
*PlexNotifier.js* is a *Node.js* based application to send **pushover** watching notifications and **mail** new updates in your plex server.

![PlexNotifier.js](http://i.imgur.com/ZL4GsGG.png "PlexNotifier.js")

##Installation
`npm install`

`npm start`

Go to http://localhost:3081, login with your **Plex** account and configure the services.

###Pushover
To configure *pushover* notifications create a new custom app in https://pushover.net and get you user/application tokens.

###Mail
*Mail* updates works with *SMTP*. I recommend https://mailgun.com to not store personal account passwords in your computer.
