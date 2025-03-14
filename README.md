# StepsTrack

[![npm version](https://badge.fury.io/js/steps-track.svg)](https://badge.fury.io/js/steps-track)
[![npm downloads](https://img.shields.io/npm/dt/steps-track.svg)](https://www.npmjs.com/package/steps-track)
[![Test](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)

StepsTrack is a lightweight and very simple TypeScript library for ***tracking, profiling, and visualizing*** hierarchical intermediate steps in a ***pipeline-based application***. It helps break down complex logic flows into smaller steps, records intermediate execution time and data, and visualizes the execution in human-readable graphs to help debuging and optimizing. It best works in pipeline functions that consists of complex logic execution flows and multiple concurrent async functions.

### Background
StepsTrack was initially developed to debug and track an agentic *Retrieval-Augmented Generation (RAG) pipeline* in production where monitoring and optimization are crucial. Chain-ing multiple LLM agents with custom logic and dynamic data inputs often led to unstable results and long response times, especially in production environment where multiple requests are running concurrently. 

To address these challenges, I created StepsTrack as a profiling and debugging tool so I could trace what had happend underlying in each requests and identify bottlenecks upon each pipeline runs. I found it very handy and useful and am sharing with anyone tackling similar challenges in their pipelines.

## Features

- 👣 **Tracking**: Tracks intermediates data, results, execution time and hierachy of the intermediate steps.
- 📊 **Gantt chart**: Visualizes step execution times.
- ⛓️ **Execution graph**: Visualizes step execution dependencies, time and ordering.
- 🎯 **Event Emmitting**: Tracks step progress for further processing.
- 🎨 **Decorators**: Easy integration with ES6 decorators.

## Installation
```
npm install --save steps-track
```

## Usage

### Basic nested steps
```js
import { Pipeline, Step } from 'steps-track';

const pipeline = new Pipeline('pipeline');

await pipeline.track(async (st: Step) => {
       
    await st.step('load_config', async (st: Step) => {
        // ... some logics ...
        st.record('foo', 'bar');
        await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    await st.step('parsing', async (st: Step) => {
            
        const pages = await st.step('preprocess', async (st: Step) => {
            // ... some logics ...
            st.record('pageCount', 3);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return Array.from({ length: 3 }, (_, idx) => `page_${idx + 1}`);
        });
    
        // Concurrent substeps
        await Promise.all(pages.map(async (page) => {
            return st.step(`page_${page}`, async (st: Step) => {
                // ... some logics ...
                return `page_${page}`;
            });
        }));
    });
});
```

### Using Decorators
StepsTrack also provides a decorator to make it easier to integrate with ES6 classes.
* The decorator wraps the callee method as a substep.
* When using the decorator, the last argument MUST be a Step instance of the parent step
* Note: The `Step` instance that the callee method received is a Substep.

```js

class MyClass {

  @WithStep('parsing')
  async parsing(st: Step) {
    // Proprocessing
    const pages = await this.preprocess(st);

    // wait a while
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Concurrently parse pages
    await Promise.all(
      pages.map(async (page) => {
        return await this.parsePage(page, st);
      }),
    );
  }

  @WithStep('preprocess')
  async preprocess(st: Step) {
    st.record('pageCount', 3);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Array.from({ length: 3 }, (_, idx) => `page_${idx + 1}`);
  }

  @WithStep('parsePage')
  async parsePage(page: string, st: Step) {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve(page);
        },
        Math.floor(Math.random() * 3000) + 500,
      );
    });
  }
}

const pipeline = new Pipeline('sample-pipeline');
await pipeline.track(async (st) => {
  const myClass = new MyClass();
  await myClass.parsing(st);
});
```

### Event emitting
```js
// Emitted when a step starts
pipeline.on('step-start', (stepKey, stepMeta) => {});

// Emitted when a step records data
pipeline.on('step-record', (stepKey, key, data, stepMeta) => {});

// Emitted when a step completes successfully
pipeline.on('step-success', (stepKey, result, stepMeta) => {});

// Emitted when a step throws an error
pipeline.on('step-error', (stepKey, error, stepMeta) => {});

// Emitted when a step completes, regardless of success or error
pipeline.on('step-complete', (stepKey, stepMeta) => {});
/**
*    result?: any;
*    error?: string;
*    time: {
*      startTs: number;
*      endTs: number;
*      timeUsageMs: number;
*    };
*    records: Record<string, any>;
* }
*/
```

### Generate Charts
```js
// ... After the pipeline execution ...

// Generate gantt chart URL by quickchart.io
const ganttChartUrl = pipeline.ganttQuickchart(ganttArgs);  

// Generate gantt chart locally using chart.js, in png format buffer
// This feature requires chart.js and chartjs-node-canvas to be installed
// Note: If you encounter error installing chart.js / node-canvas, see https://github.com/Automattic/node-canvas/wiki#installation-guides
const ganttChartBuffer = pipeline.ganttLocal(ganttArgs);    

// Generate Execution graph
const executionGraphUrl = pipeline.executionGraphQuickchart();  
```

#### Sample Execution Graph
<img src="./sample/execution-graph.png" width="70%">

#### Sample Gantt Chart
<img src="./sample/gantt-chart.png" width="70%">


### Export tracked data
```js
// ... After the pipeline execution ...
console.log(JSON.stringify(pipeline.outputHierarchy(), null, 2));

// Or sometimes you may find it useful to flatten the output
console.log(JSON.stringify(pipeline.outputFlattened(), null, 2));   
```

#### Sample Hierarchy Output
```json
{
  "name": "pipeline",
  "key": "pipeline",
  "time": { "startTs": 1739357985509, "endTs": 1739357990192, "timeUsageMs": 4683 },
  "record": {},
  "substeps": [
    {
      "name": "load_config",
      "key": "pipeline.load_config",
      "time": { "startTs": 1739357985509, "endTs": 1739357985711, "timeUsageMs": 202 },
      "record": { "foo": "bar" },
      "substeps": []
    },
    {
      "name": "parsing",
      "key": "pipeline.parsing",
      "time": {"startTs": 1739357985711, "endTs": 1739357990192, "timeUsageMs": 4481},
      "record": {},
      "substeps": [
        {
          "name": "preprocess",
          "key": "pipeline.parsing.preprocess",
          "time": { "startTs": 1739357985711, "endTs": 1739357986713, "timeUsageMs": 1002 },
          "record": {
            "pageCount": 3
          },
          "result": ["page_1", "page_2", "page_3"],
          "substeps": []
        },
        {
          "name": "page_1",
          "key": "pipeline.parsing.page_1",
          "time": { "startTs": 1739357987214, "endTs": 1739357990192, "timeUsageMs": 2978 },
          "record": {},
          "result": "page_1",
          "substeps": []
        },
        {
          "name": "page_2",
          "key": "pipeline.parsing.page_2",
          "time": { "startTs": 1739357987214, "endTs": 1739357989728, "timeUsageMs": 2514 },
          "record": {},
          "result": "page_2",
          "substeps": []
        },
        {
          "name": "page_3",
          "key": "pipeline.parsing.page_3",
          "time": { "startTs": 1739357987214, "endTs": 1739357989774, "timeUsageMs": 2560 },
          "record": {},
          "result": "page_3",
          "substeps": []
        },
        {
          "name": "sample-error",
          "key": "pipeline.parsing.sample-error",
          "time": { "startTs": 1739357990192, "endTs": 1739357990192, "timeUsageMs": 0},
          "record": {},
          "error": "Sample Error",
          "substeps": []
        }
      ]
    }
  ]
}
```


## To Do
- [X] Decorator support for easier integration.
- [X] Generate speed analysis stats from multiple runs.
- [X] Add Redis / File support for persistent data storage.
- [X] Dashboard to monitor execution logs and results.
- [X] Implement real-time execution monitoring.
- [ ] Optional LLM-extension that optimize for LLM response and usage tracking
- [ ] Independent Monitoring Portal deployment & Dockerization
- [ ] Enhance StepsTrack Monitoring Portal
  - [ ] Improve json view of record & results
  - [ ] Better support for in-progress steps (tracking of step real-time status)
  - [ ] Fine tuning step execution stats graph appearances
  - [ ] Update ReadMe with visualizations
- [ ] Python version of logger


## License
[MIT License](LICENSE)
