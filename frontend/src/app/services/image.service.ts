import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ImageQueueInfo } from '../models/ImageQueueStatus.model';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  constructor(private http: HttpClient) { }

  uploadNewImage(fileToUpload: any): Observable<string>{
    let headers = new HttpHeaders();
    headers.set('Content-Type', "multipart/form-data");
    
    const formData: FormData = new FormData();
    formData.append('files', fileToUpload, fileToUpload.name);
     
    return this.http.post<string>("/api/upload", formData, { headers }).pipe(
      catchError((e) => { return throwError(() => e)})
    );

  }

  addImageToQueue(imageId: string, promptType: number): Observable<{placeInLine: number}>{     
    return this.http.post<{placeInLine: number}>(`/api/image/${imageId}`, { imageType: promptType }).pipe(
      catchError((e) => { return throwError(() => e)})
    );
  }

  getQueueStatusOfImage(imageId: string): Observable<ImageQueueInfo> {
    return this.http.get<ImageQueueInfo>(`/api/image/${imageId}`).pipe(
      catchError((e) => { return throwError(() => e)})
    );
  }


}
