const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const compression = require("compression");
const app = require("express")();
const http = require("http").Server(app);
const mongoClient = require('mongodb').MongoClient;
const oneSignal = require('onesignal-node');
const cors = require('cors')
dotenv.config()

app.use(cors())
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let usersCollection = null;
const url = process.env.MONGO_URI
mongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
  if (err) {
    console.log('Error connecting the database', err);
  }
  const db = client.db("pushtotalk");
  usersCollection = db.collection("users")
  console.log("MongoDB connection established");
});

let io = require("socket.io")(http);
const oneSignalClient = new oneSignal.Client(process.env.OS_APP_ID, process.env.OS_APP_KEY);

io.attach(http, { pingInterval: 10000, pingTimeout: 5000, cookie: false });


let totalUserCount = 0;
let people = {};

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
    if (d.deviceType === "iOS") {
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
    const resp = await oneSignalClient.createNotification(notification)
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

io.use(function (socket, next) {
  people[socket.id] = {};
  totalUserCount++;
  socket.broadcast.emit("user", totalUserCount);
	return next();
});

io.on("connection", function (socket) {
  socket.on('join', function (data) {
    data.user.forEach(element => {
      people[socket.id] = { element: element };
    })
  });

  socket.on("disconnect", function () {
    console.log('user disconnected', people[socket.id]);
    delete people[socket.id];
  });

  socket.on("audioMessage", async function (data) {
    let message = data.message;
    if (!data.group) {
      // individual audio msg
      let receiverSocketId = findUserById(data.to[0]);

      if (receiverSocketId) {
        let receiver = people[receiverSocketId];
        console.log('receiver', receiver)

        // check if receiver and sender are connected
        if (io.sockets.connected[receiverSocketId] && io.sockets.connected[socket.id]) {
          // directly emit msg to the receiver
          io.to(receiverSocketId).emit("audioMessage", message);
        } else {
          console.log('receiver connection status', io.sockets.connected[receiverSocketId])
          console.log('sender connection status', io.sockets.connected[socket.id])
          // send push notification to receiver
          let id = data.to[0] && data.to[0].split("-")[1]
          const user = id && await usersCollection.findOne({ id: parseInt(id) });
          user && sendPushNotification([user])
        }
      } else {
        // send push notification to receiver
        let id = data.to[0] && data.to[0].split("-")[1]
        const user = id && await usersCollection.findOne({ id: parseInt(id) });
        user && sendPushNotification([user])
      }
    } else {
      let room = data.group_name;
      const users = []
      await Promise.all(data.to.map(async element => {
        let receiverSocketId = findUserById(element);
        if (receiverSocketId) {
          if (io.sockets.connected[receiverSocketId]) {
            io.sockets.connected[receiverSocketId].join(room);
          } else {
            let id = element && element.split("-")[1]
            const user = id && await usersCollection.findOne({ id: parseInt(id) });
            users.push(user)
          }
        } else {
          let id = element && element.split("-")[1]
          const user = id && await usersCollection.findOne({ id: parseInt(id) });
          users.push(user)
        }
      }))
      // sending push notification
      if (users.length) sendPushNotification(users)
      socket.broadcast.to(room).emit("audioMessage", message);
      io.of('/').in(room).clients((error, socketIds) => {
        if (error) console.log('err', err);
        socketIds.forEach(socketId => io.sockets.sockets[socketId].leave(room));
      });
    }
  });
});

function findUserById(name) {
  for (socketId in people) {
    if (people[socketId].element === name) {
      return socketId;
    }
  }
  return false;
}

//generate private room name for two users
// function getARoom(user1, user2) {
//   console.log('user1', user1)
//   console.log('user2', user2)
//   return 'privateRooom' + user1.element + "And" + user2.element;
// }

http.listen(3001, function () {
  console.log("listening to port:3001");
});