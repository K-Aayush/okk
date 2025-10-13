export default class {
  static jobImplementations;

  static findJob(type, data) {
    if (!this.jobImplementations[type]) {
      return null;
    }
    const clazz = this.jobImplementations[type];
    const implementation = new clazz(data);
    return implementation;
  }

  static isCronJob(type) {
    return this.jobImplementations[type].isCronJob;
  }

  static isRegisteredJob(type) {
    return !!this.jobImplementations[type];
  }

  static allJobTypes() {
    return Object.keys(this.jobImplementations);
  }
}
