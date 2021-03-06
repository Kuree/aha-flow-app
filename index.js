var body_parser = require('body-parser');
var rq = require('request-promise-native');
/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
	app.log('Yay, the app was loaded!');
	const BUILDKITE_TOKEN = process.env.BUILDKITE_TOKEN;
	const AHA_FLOW_TOKEN = process.env.AHA_FLOW_TOKEN;

	// this is standard express route to receive buildkite hooks
	const router = app.route("/aha-flow-app");
	const title = "StanfordAHA Flow Check"
	router.use(body_parser.json())

	// add a route
	router.post("/hook", async (req, res) => {
		const token = req.headers.authorization;
		if (token != AHA_FLOW_TOKEN) {
			res.send(401);
		}
		const id = parseInt(req.body.id);
		let github = await app.auth(id);
		const org = req.body.org;
		const repo = req.body.repo;
		const head_sha = req.body.head_sha;
		const status = req.body.status;
		const conclusion = req.body.conclusion;
		const url = req.body.url;
		let summary = "";
		github.checks.create({
			owner: org,
			repo: repo,
			name: "StanfordAHA Flow",
			head_sha: head_sha,
			status: status,
			conclusion: conclusion,
			completed_at: new Date().toISOString(),
			output: {
				title: title,
				summary: summary
			},
			details_url: url
		})
		res.send("okay")
	});

	app.on(["pull_request.synchronize", "pull_request.opened"], async context => {
		const pr = context.payload.pull_request;
		const head = pr.head
		if (!pr || pr.state !== "open") {
			// don't do anything with closed PR
			return;
		}

        if (pr.base.ref != "master") {
            // we are only interested in the pull request for the master
            return;
        }

		const sha = head.sha;
		const owner = pr.base.repo.owner;
		const org = owner.login;
		var repo = pr.base.repo.name;
		// remove the "-"
		new_repo_name = repo.split("-").join("_");

		let summary = "";

		// we need to send out a build kite build event
		var env = {
			FLOW_ORG: org,
			FLOW_REPO: repo,
			FLOW_HEAD_SHA: sha,
			FLOW_ID: context.payload.installation.id
		};
		env[new_repo_name] = sha;
        env["PR"] = 1;

		var options = {
			method: "POST",
			url: "https://api.buildkite.com/v2/organizations/stanford-aha/pipelines/aha-flow/builds",
			body: {
				commit: "HEAD",
				branch: "master",
				message: "PR from " + repo,
				env: env,
			},
			json: true,
			headers: {
				Authorization: "Bearer " + BUILDKITE_TOKEN
			}
		}

		var link = "";
		const result = await rq(options)
		 .then(function(info) {
			link = info.web_url;
		 })
		 .catch(function(err) {
			 app.log(err);
		 });


		return context.github.checks.create({
			owner: org,
			repo: repo,
			name: "StanfordAHA Flow",
			head_sha: sha,
			status: 'in_progress',
			output: {
				title: title,
				summary: summary
			},
			details_url: link,
			started_at: new Date().toISOString(),
		})
	})

}
