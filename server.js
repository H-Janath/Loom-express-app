const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')
const express = require('express')
const fs = require('fs')
const app = express()
const { Readable } = require('stream')
const dotenv = require('dotenv')
const { default: axios } = require('axios')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const OpenAI = require('openai')

// ✅ FIX: make File available globally for OpenAI SDK
globalThis.File = require('node:buffer').File;
dotenv.config()
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY
})

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY
  },
  region: process.env.BUCKET_REGION
});
const server = http.createServer(app)

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRONE_HOST,
    method: ['GET', 'POST'],
  }
})

let recordedChunk = []

io.on('connection', (socket) => {
  console.log("Socket is connected");

  socket.on('video-chunks', async (data) => {
    console.log("Video chunk is sent")

    const writestream = fs.createWriteStream('temp_upload/' + data.filename)
    recordedChunk.push(data.chunks)
    const videoBlob = new Blob(recordedChunk, {
      type: 'video/webm; codecs=vp9'
    })
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    const readStream = Readable.from(buffer);
    readStream.pipe(writestream).on('finish', () => {
      console.log("Chunks saved",)
    })
  })

  socket.on("process-video", async (data) => {
    console.log("Process video..", data);
    recordedChunk = []
    fs.readFile('temp_upload/' + data.filename, async (error, file) => {
      const processing = await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/processing`,
        {filename: data.filename}
      )
      if (processing.data.status !== 200)
        return console.log(
          "Error: something went wrong with creating the processing file"
        )
        console.log(data.filename + " " + "Uploading to AWS S3");
      const key = data.filename
      const bucketName = process.env.BUCKET_NAME;
      console.log(key)
      const ContentType = 'video/webm'
      const command = new PutObjectCommand({
        Key:key,
        Bucket:bucketName,
        ContentType,
        Body: file,
      })

      const fileStatus = await s3.send(command);
      if (fileStatus['$metadata'].httpStatusCode === 200) {
        console.log("Video uploaded To AWS");

        if (processing.data.plan === "PRO") {
          fs.stat('temp_upload/' + data.filename, async (error, stat) => {
            if (!error) {
              //wisper 5 md
              if (stat.size < 25000000) {
                const transcription = await openai.audio.transcriptions.create({
                  file: fs.createReadStream(`temp_upload/${data.filename}`),
                  model: "whisper-1",
                  response_format: 'text',
                })
                if (transcription) {
                  const completion = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    response_format: { type: 'json_object' },
                    messages: [
                      {
                        role: 'system',
                        content: `You are going to generate a title and a nice description using the speech to text transcription provided: transcription(${transcription}) and then return it in jason format as {"title": <the title you gave>, "summary": <the summary you created>}`,
                      },
                    ],
                  })
                  const titleAndSummaryGenerated = await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/transcribe`, {
                    filename: data.filename,
                    content: completion.choices[0].message.content,
                    transcription: transcription,
                  });
                  if(titleAndSummaryGenerated.data.status !==200)
                    console.log(
                        "Something went wrong when creating the title and description"
                    );
                }
              }
            }
          })
        }
          const stopProcesssing = await axios.post(
            `${process.env.NEXT_API_HOST}recording/${data.userId}/complete`,
            {filename:data.filename}
          )
          if(stopProcesssing.data.status !==200)
              console.log("Error: Something went wrong when stopping the process and trying to complete  the processing stage")
          if(stopProcesssing.data.status === 200){
            fs.unlink('temp_upload/'+data.filename,(error)=>{
              if(!error) 
                console.log(data.filename+ " "+ 'deleted successfully')
            })
          }   
      }else{
        console.log("Error, Upload failed process aborted")
      }
    })
  })

  socket.on("disconnect", async (data) => {
    console.log("Socket id is disconnect", socket.id)
  })
});


server.listen(5000, () => {
  console.log("Server is running on port 5000")
})