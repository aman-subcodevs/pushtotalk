var app = require("express")();
var http = require("http").Server(app);

var io = require("socket.io")(http); 

var Usercounter = 0;

app.get("/", function(req, res) {
  res.send({data:"success"});
});

io.on("connection", function(socket) {
  Usercounter = Usercounter + 1;
  socket.broadcast.emit("user", Usercounter);
  console.log("a user is connected");

  socket.on('join', function (data) {
    data.user.forEach(element => {
      socket.join(element); // We are using room of socket io
    })
  });
  
  socket.on("disconnect", function() {
    Usercounter = Usercounter - 1;
    socket.broadcast.emit("user", Usercounter);
    console.log("user disconnected");
  });

  socket.on("audioMessage", function(users) {
    console.log(users);
    let message  = users.message;
    
    users.to.forEach(element => {
      console.log(element);
      //socket.to(element).emit("audioMessage", message);
      io.sockets.to(element).emit("audioMessage", message);
     // io.to(element).emit("audioMessage", message);
      //socket.broadcast.to(element).emit("audioMessage", message);
    });
   
  });
});

http.listen(3001, function() {
  console.log("listening to port:3001");
});
