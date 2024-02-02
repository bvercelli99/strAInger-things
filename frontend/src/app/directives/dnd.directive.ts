import { Directive, EventEmitter, HostBinding, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[appDnd]',
  standalone: true
})
export class DndDirective {

  constructor() { }

  @HostBinding('class.fileover') fileOver: boolean = false;
  @Output() fileDropped = new EventEmitter<any>();

  // Dragover listener
  @HostListener('dragover', ['$event']) onDragOver(evt:any) {
    evt.preventDefault();
    evt.stopPropagation();
    this.fileOver = true;
  }

  // Dragleave listener
  @HostListener('dragleave', ['$event']) public onDragLeave(evt: any) {
    evt.preventDefault();
    evt.stopPropagation();
    this.fileOver = false;
  }

  // Drop listener
  @HostListener('drop', ['$event']) public ondrop(evt:any) {
    evt.preventDefault();
    evt.stopPropagation();
    this.fileOver = false;
    let files = evt.dataTransfer.files;
    if (files.length == 1) {
      if(this.isImgMimeType(files[0])){
        this.fileDropped.emit(files);
      }
    }
  }

  private isImgMimeType(file: any): boolean{
    switch(file.type){
      case "image/bmp": 
      case "image/jpeg": 
      case "image/x-png":
      case "image/png":
        return true;
      default:
        return false;
    }
  }

}
