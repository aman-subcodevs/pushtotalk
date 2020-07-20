// const { disconnect } = require("process");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const compression = require("compression");
const { ObjectId } = require("mongodb")
const app = require("express")();
const http = require("http").Server(app);
const clinet = require('mongodb').MongoClient;
const oneSignal = require('onesignal-node');
const cors = require('cors')
dotenv.config()

app.use(cors())
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let usersCollection = null;
const url = process.env.MONGO_URI
clinet.connect(url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
  const db = client.db("pushtotalk");
  usersCollection = db.collection("users")
  console.log("Connected correctly to server");
});

let io = require("socket.io")(http);
const client = new oneSignal.Client(process.env.OS_APP_ID, process.env.OS_APP_KEY);

io.attach(http, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false
});

let Usercounter = 0;
sockets = [];
people = {};
disconnectUsers = {};

app.get("/", function (req, res) {
  res.send({ data: "success" });
});

const sendPushNotification = async (users, audioUrl = "https://file-examples-com.github.io/uploads/2017/11/file_example_WAV_1MG.wav") => {

  const androidTokens = []
  const iosTokens = []

  users.forEach(d => {
    if (d.deviceType === "android") {
      androidTokens.push(d.token)
    }
    if (d.deviceType === "ios") {
      iosTokens.push(d.token)
    }
  })

  const notification = {
    contents: {
      'en': 'Audio message',
    },
    data: {
      audioUrl
    },
    include_android_reg_ids: androidTokens,
    include_ios_tokens: iosTokens
  };

  try {
    const resp = await client.createNotification(notification)
    console.log('Push notifications sent succssfully');
  } catch (err) {
    console.log('Push notification err', err);
  }
}

app.post("/login-user", async (req, res) => {
  const { id, token, name, deviceType } = req.body
  const response = await usersCollection.replaceOne({ id }, { $set: { token, name, deviceType } }, { upsert: true });
  if (response && response.upsertedId) {
    res.json({ success: true, _id: response.upsertedId._id, message: "User inserted successfully" })
  } else {
    res.json({ success: true, message: "User updated successfully" })
  }
})

io.on("connection", function (socket) {
  Usercounter = Usercounter + 1;
  socket.broadcast.emit("user", Usercounter);
  console.log("a user is connected");


  socket.on('join', function (data) {
    console.log('join data', data);
    sockets.push(socket);
    data.user.forEach(element => {
      people[socket.id] = { element: element };
    })
    console.log('people', people);
  });

  socket.on("minimized", function (data) {
    console.log(data)
  });

  socket.on('ping', function () {
    console.log('ping');
    socket.emit('pong');
  });

  socket.on("disconnect", function () {
    console.log(people);
    delete people[socket.id];
    sockets.splice(sockets.indexOf(socket), 1);
    console.log(people);
    console.log("user disconnected");
    socket.emit('rejoin');
  });

  socket.on("audioMessage", async function (data) {
    console.log(people);
    let message = data.message;
    if (!data.group) {
      let receiverSocketId = findUserById(data.to[0]);
      if (receiverSocketId) {
        console.log('receiverSocketId', receiverSocketId);
        let receiver = people[receiverSocketId];
        let room = getARoom(people[socket.id], receiver);
        if (io.sockets.connected[receiverSocketId]) {
          io.sockets.connected[receiverSocketId].join(room);
          io.sockets.in(room).emit("audioMessage", message);
        } else {
          // query db with userId.
          // sendPushNotification to the token from database.
          let id = data.to[0] && data.to[0].split("-")[1]
          const user = id && await usersCollection.findOne({ id });
          user && sendPushNotification([user])
        }
      } else {
        // query db with userId.
        // sendPushNotification to the token from database.
        let id = data.to[0] && data.to[0].split("-")[1]
        const user = id && await usersCollection.findOne({ id });
        user && sendPushNotification([user])
      }
    } else {
      let room = data.group_name;
      console.log(data.to)
      const users = []
      data.to.forEach(async element => {
        let receiverSocketId = findUserById(element);
        if (receiverSocketId) {
          if (io.sockets.connected[receiverSocketId]) {
            io.sockets.connected[receiverSocketId].join(room);
          } else {
            let id = element && element.split("-")[1]
            const user = id && await usersCollection.findOne({ id });
            users.push(user)
            // query db with userId.
            // sendPushNotification to the token from database.
          }
        } else {
          // query db with userId.
          // sendPushNotification to the token from database.
          let id = element && element.split("-")[1]
          const user = id && await usersCollection.findOne({ id });
          users.push(user)
        }
      });
      console.log(room);
      // sending push notification
      sendPushNotification(users)
      socket.broadcast.to(room).emit("audioMessage", message);
    }
  });
});

// below if (receiverSocketId) {
//socket.to(element).emit("audioMessage", message);
// io.sockets.to(element).emit("audioMessage", message);
// io.to(element).emit("audioMessage", message);
//socket.broadcast.to(element).emit("audioMessage", message);

function findUserById(name) {
  for (socketId in people) {
    if (people[socketId].element === name) {
      return socketId;
    }
  }
  return false;
}

//generate private room name for two users
function getARoom(user1, user2) {
  return 'privateRooom' + user1.element + "And" + user2.element;
}

http.listen(3001, function () {
  console.log("listening to port:3001");
});
