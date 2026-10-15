"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getType = getType;
const mime_types_1 = __importDefault(require("mime-types"));
const ylru_1 = require("ylru");
let typeLRUCache;
function getType(type) {
    if (!typeLRUCache) {
        typeLRUCache = new ylru_1.LRU(100);
    }
    let mimeType = typeLRUCache.get(type);
    if (mimeType === undefined) {
        mimeType = mime_types_1.default.contentType(type);
        typeLRUCache.set(type, mimeType);
    }
    return mimeType;
}
exports.default = getType;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFLQSwwQkFVQztBQWZELDREQUFtQztBQUNuQywrQkFBMkI7QUFFM0IsSUFBSSxZQUFpQixDQUFDO0FBRXRCLFNBQWdCLE9BQU8sQ0FBQyxJQUFZO0lBQ2xDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQixZQUFZLEdBQUcsSUFBSSxVQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUNELElBQUksUUFBUSxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQWlCLElBQUksQ0FBQyxDQUFDO0lBQ3RELElBQUksUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzNCLFFBQVEsR0FBRyxvQkFBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQUVELGtCQUFlLE9BQU8sQ0FBQyJ9