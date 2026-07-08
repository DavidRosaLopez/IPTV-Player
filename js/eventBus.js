/**
 * eventBus.js — Simple Publish/Subscribe Event Bus
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    const list = this.listeners.get(event) || [];
    list.push(callback);
    this.listeners.set(event, list);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (!list) return;
    const next = list.filter(cb => cb !== callback);
    if (next.length) this.listeners.set(event, next);
    else this.listeners.delete(event);
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (!list) return;
    list.slice().forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error executing event ${event}:`, e);
      }
    });
  }

  clear(event = null) {
    if (event === null) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(event);
  }
}

export const eventBus = new EventBus();
