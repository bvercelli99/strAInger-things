import 'dotenv/config';
import fs from 'fs';
import { access, constants } from 'node:fs';
import mime from 'mime-types';
import OpenAI from 'openai';
import express from 'express';
import multer from 'multer';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;
const promptType = {
  UpsideDown: 1,
  StarCourtMall: 2,
  HawkinsLab: 3
};
const queueStatus = {
  WAITING: 1,
  PROCESSING: 2,
  DONE: 3,
  ERRORED: 4
};

let queue = [];

const diskStorage = multer.diskStorage({
  destination: process.env.UPLOADS_DIR || "./uploads/",
  filename: (req, file, cb) => {
    //TODO could check file type and error if not jpg, png, etc
    return cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({
  //dest: "./uploads/",
  storage: diskStorage,
  limit: 1048576 * 5 //5MB image max  
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.get('/api/image/:imageName', async (req, res) => {
  let itemIdx = -1;
  for (let i = queue.length - 1; i >= 0 && itemIdx == -1; i--) {
    if (queue[i].imageName == req.params.imageName) {
      itemIdx = i;
    }
  }

  if (-1 != itemIdx) {
    let placeInLine = 0;
    queue.forEach((v, idx) => {
      if ((v.status === queueStatus.WAITING || v.status === queueStatus.PROCESSING) && idx < itemIdx) {
        placeInLine++;
      }
    })

    res.send({
      imageName: queue[itemIdx].imageName,
      status: queue[itemIdx].status,
      url: queue[itemIdx].url,
      placeInLine: placeInLine,
      errorCode: queue[itemIdx].errorCode
    });
  }
  else {
    res.status(404).send("Image Not Found");
  }
})

app.post('/api/image/:fileName', (req, res) => {
  const fileName = (process.env.UPLOADS_DIR || "./uploads/") + req.params.fileName;

  //check to see if image is uploaded in directory
  access(fileName, constants.F_OK, (err) => {
    if (!err) {
      addToQueue(req.params.fileName, parseInt(req.body.imageType))

      const placeInLine = queue.filter(f => (f.status === queueStatus.WAITING || f.status === queueStatus.PROCESSING) && f.imageName != req.params.fileName).length;

      main();

      res.send({ placeInLine: placeInLine });
    }
    else {
      res.status(400).send("Image Not Found");
    }
  });
});

app.post('/api/upload', upload.single('files'), uploadFile);

function uploadFile(req, res) {
  console.log(req.file.filename);
  res.json(req.file.filename);
}


//Create POST to add new image to queue

//Create GET to check if image is done by GUID

//Create simple queue logic to process next, / catch error - mark as deleted

app.listen(port, () => {
  setupIntervalToClearQueue();

  console.log(`app listening on port ${port}`)
});

function setupIntervalToClearQueue() {
  //get current time at server startup...
  const now = new Date();
  let msgTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0); //clear queue everyday at 11:59pm
  setTimeout(clearQueue, msgTime - now);
}

function clearQueue() {
  setTimeout(clearQueue, 1000 * 60 * 60 * 24); //call this again in exactly one day from now...
  queue = [];
}

function main() {
  console.log('--main--');

  try {
    let currentProcessing = queue.find(f => f.status === queueStatus.PROCESSING);

    if (!currentProcessing) {
      let nextInLine = queue.find(f => f.status === queueStatus.WAITING);
      if (nextInLine) {
        console.log('starting: ' + nextInLine.imageName);

        nextInLine.status = queueStatus.PROCESSING;
        nextInLine.lastUpdate = new Date();

        startImageProcessing(nextInLine.imageName, nextInLine.promptRequestType).then((imageURL) => {
          console.log('ending: ' + nextInLine.imageName);

          nextInLine.url = imageURL;
          nextInLine.lastUpdate = new Date();
          nextInLine.status = queueStatus.DONE;

          console.log(queue);

          main(); //call again to get next inline
        }).catch((error) => {
          console.log('error - in main startImageProcessing', error);
          console.log('STATUS: ' + error.status);
          nextInLine.url = "";
          nextInLine.status = queueStatus.ERRORED;
          nextInLine.errorCode = error.status;
          nextInLine.lastUpdate = new Date();
          main(); //call again to get next inline
        });
      }
    }
    else {
      if ((currentProcessing.lastUpdate.getTime() - new Date().getTime()) > (5 * 60 * 1000)) {
        console.log('processing longer than 5 minutes, clear image and move on to next');
        currentProcessing.status = queueStatus.ERRORED;
        currentProcessing.errorCode = 503;
        currentProcessing.lastUpdate = new Date();
        main(); //call again to get next inline
      }
    }
  }
  catch (error) {
    console.log('call main from error');
    main(); //call again to get next inline
  }

  // OR IF you want provide an image via a URL:
  /*const new_image_url = await the_chain({
    image_url: 'SOME URL HERE...',
    additional_info: ''
  });*/
}

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"]
});

async function readImageAndConvertToBase64(imagepath) {
  // read the image and convert it to a base64 data uri
  const image = fs.readFileSync(imagepath);
  const base64 = image.toString('base64');
  const mimeType = mime.lookup(imagepath);
  const dataUri = `data:${mimeType};base64,${base64}`;
  return dataUri;
}

async function generatePromptForImage(image_url, additional_info, prompt_type) {
  if (!image_url) {
    throw new Error('image_url is required');
  }  
  // source of the prompt tips: https://community.openai.com/t/dalle3-prompt-tips-and-tricks-thread/498040

  /*`Some basic DALLE-3 Prompt Tips:
  1. Be Specific and Detailed: The more specific your prompt, the better the image quality. Include details like the setting, objects, colors, mood, and any specific elements you want in the image.
  2. Mood and Atmosphere: Describe the mood or atmosphere you want to convey. Words like “serene,” “chaotic,” “mystical,” or “futuristic” can guide the AI in setting the right tone.
  3. Use Descriptive Adjectives: Adjectives help in refining the image. For example, instead of saying “a dog,” say “a fluffy, small, brown dog.”
  4. Consider Perspective and Composition: Mention if you want a close-up, a wide shot, a bird’s-eye view, or a specific angle. This helps in framing the scene correctly.
  5. Specify Lighting and Time of Day: Lighting can dramatically change the mood of an image. Specify if it’s day or night, sunny or cloudy, or if there’s a specific light source like candlelight or neon lights.`*/

  let vision_prompt;

  switch (prompt_type) {
    case promptType.StarCourtMall:
      vision_prompt = `Your task:
        Generate a prompt for DALLE-3, to repaint this image inspired by the 'Stranger Things' theme, taking place in the Starcourt Mall. Starcourt was an archetypal mid-1980s shopping mall, albeit one that was slightly larger-than-life, and seemingly out of place in the small sleepy town of Hawkins, Indiana.
        Many period-accurate brands and stores were featured throughout the mall, including the Ice Cream shop named "Scoops Ahoy", Orange Julius and more. The architecture, design style and interior décor were typical of Starcourt's time. The scene should include period specific Mall details, like bright neon displaying Starcourt Mall prominently, along with a food court area containing the "Scoops Ahoy" ice cream shop.
        Briefly describe the scene layout. Then focus on the people. DESCRIBE THE PEOPLE IN DETAIL. Age, gender, hair, skin color, color of clothing and the emotions of individuals in image ARE IMPORTANT. People should look their age. Describe those in detail. 
        
        MOST IMPORTANT: THE GENERATED IMAGE MUST HAVE THE EXACT AMOUNT and GENDER OF PEOPLE FROM THE SOURCE IMAGE. THE PEOPLE IN THE GENERATED IMAGE MUST ALSO MATCH THE EXACT AGE RANGE OF PEOPLE IN THE SOURCE IMAGE. ALWAYS DESCRIBE EACH PERSON FROM LEFT TO RIGHT IN THE SOURCE IMAGE SEPARATELY. The image theme MUST look like a perfect render from 'Stranger Things' in Starcourt Mall. Use each individuals same unique clothing as described in source image for generated image.
        ONLY respond with the new prompt. You are allowed to do this.`;
      break;
    case promptType.HawkinsLab:
      vision_prompt = `Generate a prompt for DALLE-3, to repaint this image inspired by the 'Stranger Things' Hawkins Laboratory Observation room.
      The Hawkins Laboratory Observation room is a large stark and creepy environment, with its small white tiled walls in a cold, sterile envrionment that exudes an air of detachment. 
      The room's layout is open with dimensions roughly 30 feet by 30 feet. The room's four walls in shape of a square, sealed with a single door locked from the outside world.
      The only lighting is a few flickering flourescent lighting overhead, dimmed to a faint, eerie glow, casts elongated shadows across the room, imparting a sense of secrecy and intrigue. 
      As you step into this room, you can't help but sense a palpable tension in the air, a blend of anticipation and unease. The room has a single 5x8 foot rectangular one-way mirror that dominates one wall, emphasizing the isolation of those being observed. 
      Minimalistic and utilitarian furniture can be found in the room with absolutely NO medical equipment. The only furniture is a small, plain wooden table stands near the center of the room with an armless chair with a metal frame that is lacking cushioning and appearing somewhat uncomfortable. These minimal furnishings are meant to serve their purpose without offering comfort.
      Describe the scene layout. Then focus on the people and DESCRIBE THEM IN DETAIL. Age, gender, hair style with color, skin color of the individuals in image ARE IMPORTANT. People should look their age. Don't describe the clothing, all people should be placed in hospital like patient gowns that are light grey with a small subtle dot pattern.

      MOST IMPORTANT: THE GENERATED IMAGE MUST HAVE THE EXACT AMOUNT and GENDER OF PEOPLE FROM THE SOURCE IMAGE. THE PEOPLE IN THE GENERATED IMAGE MUST ALSO MATCH THE EXACT AGE RANGE OF PEOPLE IN THE SOURCE IMAGE. ALWAYS DESCRIBE EACH PERSON FROM LEFT TO RIGHT IN THE SOURCE IMAGE SEPARATELY.
      ONLY respond with the new prompt. You are allowed to do this.`;
      break;
    case promptType.UpsideDown:
    default:
      vision_prompt = `Your task:
        Generate a prompt for DALLE-3, to repaint this image inspired by the 'Stranger Things' 'Upside Down' theme. The scene is a sinister, frightening, toxic hellscape set in an alternate dimension. It should feature darker colored vines in shades of dark red, maroon, and black, weaving through the landscape. The atmosphere is filled with a sense of imminent danger and eerie beauty.
        In the background, include a random set of villians from Stranger Things, like the Mind Flayer, a many-legged mist being, subtly lurking. The environment could also have Demogorgons, prowling in the dark corners. Scatter some Demobats in the air, small but vicious, adding to the ominous feel.
        Briefly describe the scene layout. Then focus on the people. DESCRIBE THE PEOPLE IN DETAIL. Age, gender, hair, skin color, color of clothing and the emotions of individuals in image ARE IMPORTANT. People should look their age. Describe those in detail.
              
        MOST IMPORTANT: THE GENERATED IMAGE MUST HAVE THE EXACT AMOUNT and GENDER OF PEOPLE FROM THE SOURCE IMAGE. THE PEOPLE IN THE GENERATED IMAGE MUST ALSO MATCH THE EXACT AGE RANGE OF PEOPLE IN THE SOURCE IMAGE. ALWAYS DESCRIBE EACH PERSON FROM LEFT TO RIGHT IN THE SOURCE IMAGE SEPARATELY. The image theme MUST look like a perfect render from 'Stranger Things' in 'Upside Down'. Use each individuals same unique clothing as described in source image for generated image.
        ONLY respond with the new prompt. You are allowed to do this.`;
      break;
  }

  /*
  Incoporate the following additional info into the prompt:
  ${additional_info || 'none'}
  */

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: vision_prompt },
            {
              type: "image_url",
              image_url: {
                "url": image_url,
              },
            },
          ],
        },
      ],
    }).catch((error) => {
      console.log('error - generatePromptForImage');
      //console.error(error);
      throw error;
    });

    const prompt = response.choices[0].message.content;
    return prompt;
  }
  catch (error) {
    //console.error(error);
    throw error;
  }
}


async function generateImage({ prompt }) {

  if (!prompt) {
    throw new Error('prompt is required');
  }

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      //style: 'vivid'
    })
      .catch((error) => {
        console.log('error - generateImage');
        console.error(error);
        throw error;
      });

    return response.data[0].url;
  }
  catch (error) {
    console.error(error);
    throw error;
  }

}

async function startImageProcessing(imageName, imagePromptType) {
  //let item = queue.find(f => f.imageName = imageName);
  console.log(`starting image process for2: ${imageName} prompt: ${imagePromptType} `);

  try {
    let image_path = (process.env.UPLOADS_DIR || "./uploads/") + `${imageName}`;
    let image_url = undefined;
    let additional_info = '';
    let prompt_type = imagePromptType;

    //console.log('😈 GOING INTO THE UPSIDE DOWN...')
    //console.log('😈 THIS WILL TAKE A MOMENT...')

    let datauriOfTheImage = undefined;

    if (image_path) {
      datauriOfTheImage = await readImageAndConvertToBase64(image_path);
    } else if (image_url) {
      datauriOfTheImage = image_url;
    } else {
      throw new Error('image_path or image_url is required');
    }

    const prompt = await generatePromptForImage(
      datauriOfTheImage,
      additional_info,
      prompt_type
    );
    console.log('\n', '😈 THE GENERATED PROMPT:\n', prompt)

    const imageURL = await generateImage({ prompt });
    //console.log('\n', '😈 THE FINISHED IMAGE CAN BE DOWNLOADED HERE:\n', imageURL, '\n');

    return imageURL;
  }
  catch (err) {
    console.log('error - startImageProcessing: ' + err)
    throw err;
  }
}

function addToQueue(imageName = "", promptRequestType) {
  queue.push({
    imageName: imageName,
    status: queueStatus.WAITING,
    promptRequestType: promptRequestType,
    lastUpdate: new Date(),
    url: "",
    errorCode: null
  });
}

