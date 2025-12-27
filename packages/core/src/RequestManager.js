export default class RequestFlow {
    constructor() {
        this.requestList = [];
    }
    setRequestAdapter(adapter) {
        this.adapter = adapter;
        return this;
    }
    addAll(requestList = []) {
        this.requestList = this.requestList.concat(requestList);
        return this;
    }
    withErrorHandler(errorHandler) {
        this.errorHandler = errorHandler;
        return this;
    }
    withResultHandler(resultHandler) {
        this.resultHandler = resultHandler;
        return this;
    }
    withFinishHandler(finishHandler) {
        this.finishHandler = finishHandler;
        return this;
    }
}
//# sourceMappingURL=RequestManager.js.map