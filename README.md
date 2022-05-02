<img src="logo/logo.png"/>

## Maxine : Service Discovery and Registry server for Microservices

<div align=center>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/images/project_badges/sonarcloud-black.svg"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/quality_gate?project=VrushankPatel_Gargantua-Maxine-Server"/></a><br/>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=bugs"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=code_smells"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=sqale_rating"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=reliability_rating"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=security_rating"/></a>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=vulnerabilities"/></a>
<a target="_blank" href="https://github.com/VrushankPatel/Gargantua-Maxine-Server/actions/workflows/codeql.yml"><img src="https://github.com/VrushankPatel/Gargantua-Maxine-Server/actions/workflows/codeql.yml/badge.svg"/></a>
<a target="_blank" href="https://github.com/VrushankPatel/Maxine-Server/actions/workflows/node.js.yml"><img src="https://github.com/VrushankPatel/Maxine-Server/actions/workflows/node.js.yml/badge.svg?branch=master"/></a>
<a target="_blank" href="https://codecov.io/gh/VrushankPatel/Maxine-Server"><img src="https://codecov.io/gh/VrushankPatel/Maxine-Server/branch/master/graph/badge.svg?token=SONYL0TJKT"/></a>

<a target="_blank" href="https://app.k6.io/runs/public/23fbf58304af4024aae52f7c3a0c9ea1"><img src="https://img.shields.io/badge/K6-Load%20Test%20Report-Blue"/></a>


<a target="_blank" href="https://circleci.com/gh/VrushankPatel/Maxine-Server/tree/master"><img src="https://circleci.com/gh/VrushankPatel/Maxine-Server/tree/master.svg?style=shield"></a>
<a target="_blank" href="https://circleci.com/gh/VrushankPatel/Maxine-Server/tree/master"><img src="https://circleci.com/gh/VrushankPatel/Maxine-Server/tree/master.svg?style=svg"></a>
<a target="_blank" href="https://ci.appveyor.com/project/VrushankPatel/maxine-server"><img src="https://ci.appveyor.com/api/projects/status/vsoncd8c5fkqi4he?svg=true"></a>
<a href="https://deepscan.io/dashboard#view=project&tid=17516&pid=20865&bid=581416"><img src="https://deepscan.io/api/teams/17516/projects/20865/branches/581416/badge/grade.svg" alt="DeepScan grade"></a>


<br/>
<a target="_blank" href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-teal.svg"/></a>
<a target="_blank" href="https://www.javascript.com"><img src="https://img.shields.io/badge/Made%20with-JavaScript-1f425f.svg"/></a>
<a target="_blank" href="https://github.com/VrushankPatel"><img src="https://img.shields.io/badge/maintainer-VrushankPatel-blue"/></a>
<a target="_blank" href="https://app.fossa.com/reports/a83419a2-657c-400c-b3b6-f04c8a032a56"><img src="https://img.shields.io/badge/Fossa-Report-blue"/></a>
<a targget="_blank" href="https://app.fossa.com/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server?ref=badge_shield" alt="FOSSA Status"><img src="https://app.fossa.com/api/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server.svg?type=shield"/></a>
<a href="https://app.fossa.com/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server?ref=badge_small" alt="FOSSA Status"><img src="https://app.fossa.com/api/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server.svg?type=small"/></a>
</div>
<br/>

### Setup for development

#### Starting the development server

1. Clone the project in your local dir.
2. Install all the dependencies by `npm i`.
3. Start dev server by `npm run dev` (nodemon).

#### Test the maxine and generate the coverage.

1. run `npm test` to run all the tests.
2. To generate the reports, there is a task called genreports, try `npm run genreports` to generate reports.
3. To upload the coverage report to codecov.io, the codecov token is required, set the parameter `>>> CODECOV_TOKEN = {token}` in environment and run `npm run coverage` to upload the coverage to codecov.

#### Run maxine on production.

1. Run command `npm start` to start the application with all the pretests.


Licence
-------
MIT License Copyright (c) 2022 Vrushank Patel

Permission is hereby granted, free
of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice
(including the next paragraph) shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### Licence scan
<a target="_blank" href="https://app.fossa.com/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server?ref=badge_large"><img src="https://app.fossa.com/api/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server.svg?type=large"/></a>
