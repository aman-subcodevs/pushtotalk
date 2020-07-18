const { disconnect } = require("process");

var app = require("express")();
var http = require("http").Server(app);

var io = require("socket.io")(http); 
io.attach(http, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false
});

var Usercounter = 0;
sockets = [];
people = {};
disconnectUsers = {};

app.get("/", function(req, res) {
  res.send({data:"success"});
});

io.on("connection", function(socket) {
  Usercounter = Usercounter + 1;
  socket.broadcast.emit("user", Usercounter);
  console.log("a user is connected");
  

  socket.on('join', function (data) {
    console.log('join data',data);
    sockets.push(socket);
    data.user.forEach(element => {
      people[socket.id] = {element: element};
    })
    console.log('people',people);
  });

  socket.on("minimized", function(data) {
   console.log(data)
  });

  socket.on('ping', function() {
    console.log('ping');
    socket.emit('pong');
  });
  
  socket.on("disconnect", function() {
    console.log(people);
    delete people[socket.id];
    sockets.splice(sockets.indexOf(socket), 1);
    console.log(people);
    console.log("user disconnected");
    socket.emit('rejoin');
  });

  socket.on("audioMessage", function(data) {
    console.log(people);
   
    let message  = data.message;
    if(!data.group){
      var receiverSocketId = findUserById(data.to[0]);
      if(receiverSocketId){
        console.log('receiverSocketId',receiverSocketId);
        var receiver = people[receiverSocketId];
        var room = getARoom(people[socket.id], receiver);
        if(io.sockets.connected[receiverSocketId]){
        io.sockets.connected[receiverSocketId].join(room);
        io.sockets.in(room).emit("audioMessage", message);
        }
       
      }
     
    }else{
      var room = data.group_name;
      console.log(data.to)
      data.to.forEach(element => {
        var receiverSocketId = findUserById(element);
        if(receiverSocketId){
          if(io.sockets.connected[receiverSocketId]){
          io.sockets.connected[receiverSocketId].join(room);
          }
        }
        //socket.to(element).emit("audioMessage", message);
       // io.sockets.to(element).emit("audioMessage", message);
       // io.to(element).emit("audioMessage", message);
        //socket.broadcast.to(element).emit("audioMessage", message);
      });
      console.log(room);
      socket.broadcast.to(room).emit("audioMessage", message);
    }
  });
});

function findUserById(name){
  for(socketId in people){
    if(people[socketId].element === name){
      return socketId;
    }
  }
  return false;
}

//generate private room name for two users
function getARoom(user1, user2){
  return 'privateRooom' + user1.element + "And" + user2.element;
}

http.listen(3001, function() {
  console.log("listening to port:3001");
});
