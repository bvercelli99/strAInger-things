import { QueueStatus } from "./queue-status.enum";

export interface ImageQueueInfo {
    imageName: string, 
    status: QueueStatus, 
    url: string, 
    placeInLine: number,
    errorCode: number
}

const DEFAULT = {
    imageName: "", 
    status: -1, 
    url: "", 
    placeInLine: -1,
    errorCode: -1
};

export function createImageQueueStatus(obj: any):ImageQueueInfo {
    return {...DEFAULT, ...obj }
}