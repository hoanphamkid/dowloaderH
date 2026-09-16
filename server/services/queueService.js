import { AppError } from '../utils/errors.js';
export class TaskQueue {
  constructor(concurrency, capacity) {
    this.concurrency = concurrency;
    this.capacity = capacity;
    this.running = 0;
    this.pending = [];
  }
  add(task, onPosition = () => {}) {
    if (this.pending.length >= this.capacity)
      return Promise.reject(new AppError('Server busy. Please try again shortly.', 503));
    return new Promise((resolve, reject) => {
      this.pending.push({ task, onPosition, resolve, reject });
      this.pump();
    });
  }
  pump() {
    while (this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      this.running++;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
    this.pending.forEach((item, i) => item.onPosition(i + 1));
  }
}
