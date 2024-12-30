# StepsTrack

StepsTrack is a lightweight Typescript library for tracking, profiling and visisualizing hierarchical steps in a pipeline-based application. It breaksdown complex function into smaller steps, records execution time and data of each intermdiate steps, and visualize the execution into human-readable graphs for easier monitoring and optimizations. 

Perfect for optimizing pipeline-based applications (such as RAG pipeline) that need insights into their execution flow, especially when dealing with complex logic flows and multi-step operations that benefit from visual representation and detailed timing analysis.

## Features

- ⏱️ **Track** intermediates data, results, execution time and hierachy of all steps in a pipeline application.
- 📊 **Gantt chart** for visual representation of step execution time.
- 👀 **Execution graph** for visual representation of step execution dependencies, time and ordering.
- 🎯 **Event Emmitting** for tracking step progress for further processing.

## Use Cases

## Get Started

#### Installation
```
npm install --save steps-track
```

#### Sample Usage
```js
import { Pipeline, Step } from 'steps-track';

const pipeline = new Pipeline('pipeline');

// If you want to as soon as a step is completed. e.g. notify subscriber
pipeline.on('step-start', (key) => {
    console.log(`Step started: ${key}`);
});
pipeline.on('step-result', (key, result) => {   
    console.log(`Step result: ${key} - ${result}`);
    // ... Your logic here ...
});

await pipeline.track(async (st: Step) => {
    
    await st.step('step_1', async (st: Step) => {   // Result of the step will be automatically recorded
        // Your logic here
    });

    await st.step('step_2', async (st: Step) => {

        // ... Some Logic here ...

        await st.step('step_2a', async (st: Step) => {  // Creating sub-step step_2a from from step_2

            // ... Some Logic here ...

            // Record some intermediate data
            st.record('foo', 'bar');

            return {
                answer: 42
            };
        });

        await st.step('step_2b', async (st: Step) => {

            // ... Some Logic here ...

            return myFunc();
        });
    });
```

#### Generate Charts
```json
// ... After the pipeline execution ...

// Generate gantt chart URL by quickchart.io
const ganttChartUrl = pipeline.ganttQuickchart(ganttArgs);  

// Generate gantt chart locally using chart.js, in png format buffer
// Note: If you encounter error installing chart.js / node-canvas, see https://github.com/Automattic/node-canvas/wiki#installation-guides
const ganttChartBuffer = pipeline.ganttLocal(ganttArgs);    

// Generate Execution graph
const executionGraphUrl = pipeline.executionGraphQuickchart();  
```

#### Sample Execution Graph
<img src="./sample/sample-execution-graph.png" width="70%">

#### Sample Gantt Chart
<img src="./sample/sample-gantt-chart.png" width="70%">


#### Output tracked data for further analysis
```json
// ... After the pipeline execution ...
console.log(JSON.stringify(pipeline.outputHierarchy(), null, 2));
console.log(JSON.stringify(pipeline.outputFlattened(), null, 2));   // Sometimes you may find it useful to flatten the output
```

#### Sample Hierarchy Output
```json
{
    "name": "pipeline",
    "key": "pipeline",
    "time": { "startTs": 1735561119986, "endTs": 1735561121392, "timeUsageMs": 1406 },
    "record": {},
    "substeps": [
        {
            "name": "step_1",
            "key": "pipeline.step_1",
            "time": { "startTs": 1735561119986, "endTs": 1735561119986, "timeUsageMs": 0 },
            "record": {},
            "substeps": []
        },
        {
            "name": "step_2",
            "key": "pipeline.step_2",
            "time": { "startTs": 1735561119986, "endTs": 1735561121392, "timeUsageMs": 1406 },
            "record": {},
            "substeps": [
                {
                    "name": "step_2a",
                    "key": "pipeline.step_2.step_2a",
                    "time": { "startTs": 1735561119986, "endTs": 1735561120991, "timeUsageMs": 1005 },
                    "record": { "foo": "bar" },
                    "result": { "answer": 42 },
                    "substeps": []
                },
                {
                    "name": "step_2b",
                    "key": "pipeline.step_2.step_2b",
                    "time": { "startTs": 1735561120991, "endTs": 1735561121392, "timeUsageMs": 401 },
                    "record": {},
                    "result": "myFunc_result",
                    "substeps": []
                }
            ]
        }
    ]
}
```


## To Do
- Generate speed analysis stats based on multiple runs of the same function
- Option to use Redis for sending events pub/sub and storing data
- Real-time execution monitoring
- LLM usage and prompt storing

## License
[MIT License](LICENSE)
