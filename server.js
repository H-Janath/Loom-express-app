const cors = require('cors')
const http = require('http')
const {Server} = require('socket.io')
const express = require('express')

const app = express()

const dotenv = require('dotenv')

dotenv.config()

const server = http.createServer(app)

app.use(cors());

const io =  new Server(server,{
    cors:{
        origin: process.env.ELECTRONE_HOST,
        method:[ 'GET', 'POST'],
    }
})

io.on('connection', (socket) => {
  console.log('Socket is connected');

  socket.on('video-chunks',async(data)=>{
    console.log(data)
  })

  socket.on("process-video",async (data)=>{
    console.log("Process video..",data)
  })

  socket.on("disconnect",async (data) =>{
    console.log("Socket id is disconnect", socket.id)
  })
});


server.listen(5000,()=>{
    console.log("Server is running on port 5000")
})