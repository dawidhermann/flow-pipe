import RequestFlow from "./RequestManager";
class RequestChain extends RequestFlow {
    constructor() {
        //  #region Public methods
        super(...arguments);
        this.next = (stage) => {
            return this.addRequestEntity(stage);
        };
        this.execute = async () => {
            try {
                const results = await this.executeAllRequests(this.requestList);
                const result = results[results.length - 1];
                if (this.resultHandler && result) {
                    this.resultHandler(result);
                }
                return result;
            }
            catch (error) {
                if (this.errorHandler) {
                    this.errorHandler(error);
                    return Promise.reject(error);
                }
                else {
                    throw error;
                }
            }
            finally {
                if (this.finishHandler) {
                    this.finishHandler();
                }
            }
        };
        //  #endregion
        //  #region Private methods
        this.addRequestEntity = (stage) => {
            this.requestList.push(stage);
            return this;
        };
        this.executeAllRequests = async (requestEntityList) => {
            const results = [];
            for (let i = 0; i < requestEntityList.length; i++) {
                const requestEntity = requestEntityList[i];
                const previousEntity = requestEntityList[i - 1];
                const previousResult = previousEntity?.result;
                const requestResult = await this.executeSingle(requestEntity, previousResult);
                let result = requestResult;
                if (requestEntity.mapper) {
                    let mappedResult;
                    if (isPipelineRequestStage(requestEntity)) {
                        mappedResult = requestEntity.mapper(requestResult);
                    }
                    else if (isPipelineManagerStage(requestEntity)) {
                        mappedResult = requestEntity.mapper(requestResult);
                    }
                    else {
                        mappedResult = result;
                    }
                    result =
                        mappedResult instanceof Promise ? await mappedResult : mappedResult;
                }
                requestEntityList[i].result = result;
                results.push(result);
            }
            return results;
        };
        this.executeSingle = async (requestEntity, previousResult) => {
            if (isPipelineRequestStage(requestEntity)) {
                const { config } = requestEntity;
                const requestConfig = typeof config === "function"
                    ? config(previousResult)
                    : config;
                const rawResult = await this.adapter.executeRequest(requestConfig);
                return this.adapter.getResult(rawResult);
            }
            else if (isPipelineManagerStage(requestEntity)) {
                const { request } = requestEntity;
                const rawResult = await request.execute();
                // For nested managers, the result is already processed, so we return it directly
                // The adapter's getResult expects AdapterExecutionResult, but nested results are already Out
                return rawResult;
            }
            else {
                throw new Error("Unknown type");
            }
        };
        //  #endregion
    }
    async executeAll() {
        try {
            const results = await this.executeAllRequests(this.requestList);
            if (this.resultHandler && results.length > 0) {
                this.resultHandler(results);
            }
            return results;
        }
        catch (error) {
            if (this.errorHandler) {
                this.errorHandler(error);
                return Promise.reject(error);
            }
            else {
                throw error;
            }
        }
        finally {
            if (this.finishHandler) {
                this.finishHandler();
            }
        }
    }
}
RequestChain.begin = (stage, adapter) => {
    const requestChain = new RequestChain();
    requestChain.setRequestAdapter(adapter);
    return requestChain.next(stage);
};
export default RequestChain;
export function begin(stage, adapter) {
    const requestChain = new RequestChain();
    requestChain.setRequestAdapter(adapter);
    return requestChain.next(stage);
}
function isPipelineRequestStage(stage) {
    return "config" in stage && !("request" in stage);
}
function isPipelineManagerStage(stage) {
    return "request" in stage && !("config" in stage);
}
//# sourceMappingURL=RequestChain.js.map