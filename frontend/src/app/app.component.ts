import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';
import { CommonModule } from '@angular/common';
import { DndDirective } from './directives/dnd.directive';
import { ImageService } from './services/image.service';
import { take } from 'rxjs';
import { ImageQueueInfo, createImageQueueStatus } from './models/ImageQueueStatus.model';
import { QueueStatus } from './models/queue-status.enum';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingSpinnerComponent, CommonModule, DndDirective],
  providers: [ImageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  srcImage: {imageId: string, src: string} | null = null;
  srcLoading = false;
  aiImage: ImageQueueInfo | null =  null;
  aiLoadingQuip: number | null = null; //stores the index of quip
  timer: any | undefined;
  readonly destinations = [
    {name: "Upside Down", value: 1},
    {name: "Starcourt Mall",  value: 2},
    {name: "Hawkins Labratory",  value: 3 }
  ];
  readonly quips = [
    "Nancy & Steve are stuck in the Upside Down, there are XXX requests in front of you.",
    "Eleven caused a scene at the skating rink, there are XXX requests in front of you.",
    "Vecna was unleashed and all hell broke loose, there are XXX requests in front of you.",
    "Something happened to Billy while lifeguarding at the pool, there are XXX requests in front of you.",
    "Max & Lucas are aguing and it's causing a slow down, there are XXX requests in front of you.",
    "Chrissy, wake up, I don't like this... there are XXX requests in front of you.",
    "Eddie is ripping Master of Puppets in the Upside Down, there are XXX requests in front of you.",
    "Max can't find her Kate Bush tape, it's not looking good... there are XXX requests in front of you.",
    "Hopper just knocked out some Russians, watch out... there are XXX requests in front of you.",
    "Joyce and Hopper entered the Upside Down through the Gate... there are XXX requests in front of you."
  ]
  
  @ViewChild("sel") selInput:ElementRef | undefined;

  constructor(private imgService: ImageService){

  }

  ngOnInit(): void {
    /*this.aiLoadingQuip = Math.floor(Math.random() * this.quips.length); 
    this.aiImage = createImageQueueStatus({
      imageName: "abc123.jpg",
      status: QueueStatus.ERRORED,
      placeInLine: 2,
      url: "",
      errorCode: 500
    });*/
  }

  canSubmit(): boolean{
    if(this.srcImage != null && !this.srcLoading && !this.aiLoadingQuip){
      return true;
    }
    return false;
  }

  onFileDropped(file: any){
    console.log('onFileDropped', file[0]);
    this.uploadImage(file[0]);
    
  }
  fileBrowseHandler(evt: any){
    console.log('fileBrowseHandler', evt.target.files[0]);
    this.uploadImage(evt.target.files[0]);
  }
  onProcessClick() {
    const promptType = this.selInput?.nativeElement.value as number;
    if(this.srcImage){
      
      this.imgService.addImageToQueue(this.srcImage.imageId, promptType).pipe(take(1)).subscribe({ 
        next: (placeInLine:{placeInLine: number}) => {
          try{
            this.aiLoadingQuip = Math.floor(Math.random() * this.quips.length); 
            this.aiImage = createImageQueueStatus({
              imageName: this.srcImage?.imageId,
              status: QueueStatus.WAITING,
              placeInLine: placeInLine.placeInLine
            });

            this.startImageIntervalCheck(this.aiImage.imageName);
          }
          catch (e){
            alert('There was an error trying to process your image');
            
          }
        },
        error: (error) => console.log('Error', error)
      });
    }
  }
  getErrorMessage(status: number): string{
    switch(status){
      case 400:
        return "Something went wrong. The people in your image must be famous, or someone needs to put a shirt on.😬"
      case 429:
        return "Oops. Something went wrong. We hit the quota! 📈"
      case 503:
      case 504:
        return "It appears the magical image service is getting overloaded. Give it 5 and try again 🙏"
      default:
        return "Something went wrong 😢 Please try again."
    }
  }

  getQuip(): string{
    if(this.aiLoadingQuip != null && this.aiImage != null){
      if(this.aiImage.placeInLine == 0){
        return "You're request is processing now hang tight!"
      }
      else{
        return this.quips[this.aiLoadingQuip].replace("there are XXX requests in front of you.", 
        "there " + (this.aiImage.placeInLine > 1 ? "are " : "is ") + this.aiImage.placeInLine + (this.aiImage.placeInLine > 1 ? " requests " : " request ") + " in front of you." );
      }
    }
    return "";
  }

  onDownloadImageClick(){
    if(this.aiImage != null && this.aiImage.url != ""){
      window.open(this.aiImage.url, "_blank");
    }
  }
  onClearSourceClick(){
    this.srcImage = null;
    this.srcLoading = false;
  }

  private async uploadImage(file: any){
    this.srcLoading = true;
    this.imgService.uploadNewImage(file).pipe(take(1)).subscribe({ 
      next: async (imageId:string) => {
        try{
          const base64 = await this.fileToBase64(file);
          this.srcImage = {
            imageId: imageId,
            src: base64 as string
          };
          this.srcLoading = false;
          console.log(this.srcImage);
        }
        catch (e){
          alert('There was an error uploading your image');
          this.srcImage = null;
          this.srcLoading = false;
        }
      },
      error: (error) => console.log('Error', error)
    });
  }

  private startImageIntervalCheck(imageName: string){
    this.timer = window.setInterval(() => {
      
        this.imgService.getQueueStatusOfImage(imageName).pipe(take(1)).subscribe({ 
          next: (info:ImageQueueInfo) => {
            try{
              if(this.aiImage != null){
                switch(info.status){
                  case QueueStatus.WAITING:
                  case QueueStatus.PROCESSING:
                    this.aiImage.placeInLine = info.placeInLine;
                  break;
                  case QueueStatus.DONE:
                    this.aiImage.placeInLine = 0;
                    this.aiImage.status = info.status;
                    this.aiImage.url = info.url;
                    window.clearInterval(this.timer);

                    this.aiLoadingQuip = null;
                  break;
                  case QueueStatus.ERRORED:
                    this.aiImage.placeInLine = 0;
                    this.aiImage.status = info.status;
                    this.aiImage.url = "";
                    this.aiImage.errorCode = info.errorCode;
                    window.clearInterval(this.timer);

                    this.aiLoadingQuip = null;
                  break;
                }
              }
            }
            catch (e){
              alert('There was an error trying to process your image');
            }
          },
          error: (error) => console.log('Error', error)
        });
      
    }, 15000)
  }

  private async fileToBase64(file: any) {
    return new Promise((resolve, reject) => {
      // Encode the file using the FileReader API
    const reader = new FileReader();
    reader.onloadend = () => {
        console.log(reader.result);
        resolve(reader.result as string);
    };
    reader.onerror = (e) => {
      console.log(e);
      reject(e);
    }
    reader.readAsDataURL(file);

    })
  }

  

}
