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
  socket.on("disconnect", function() {
    Usercounter = Usercounter - 1;
    socket.broadcast.emit("user", Usercounter);
    console.log("user disconnected");
  });

  socket.on("audioMessage", function(msg) {
    socket.broadcast.emit("audioMessage", msg);
  });
});

http.listen(3001, function() {
  console.log("listening to port:3001");
});
