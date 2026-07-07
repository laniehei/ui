package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

const taskQueue = "user-metadata-demo"

// --- Agentic Coding Loop ---

func CodingAgentWithLabels(ctx workflow.Context, task string) (string, error) {
	maxAttempts := 3
	retryPolicy := &temporal.RetryPolicy{MaximumAttempts: 2}

	for i := 0; i < maxAttempts; i++ {
		workflow.SetCurrentDetails(ctx, fmt.Sprintf("**Iteration %d/%d:** Planning changes", i+1, maxAttempts))

		planCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 30 * time.Second,
			Summary:             fmt.Sprintf("plan (iteration %d)", i+1),
			RetryPolicy:         retryPolicy,
		})
		var plan string
		err := workflow.ExecuteActivity(planCtx, CallLLM, "Plan code changes for: "+task).Get(planCtx, &plan)
		if err != nil {
			return "", err
		}

		workflow.SetCurrentDetails(ctx, fmt.Sprintf("**Iteration %d/%d:** Editing files", i+1, maxAttempts))

		editCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 30 * time.Second,
			Summary:             fmt.Sprintf("edit_file: main.py (iteration %d)", i+1),
			RetryPolicy:         retryPolicy,
		})
		var editResult string
		err = workflow.ExecuteActivity(editCtx, ExecuteTool, "edit main.py based on plan").Get(editCtx, &editResult)
		if err != nil {
			return "", err
		}

		workflow.SetCurrentDetails(ctx, fmt.Sprintf("**Iteration %d/%d:** Running tests", i+1, maxAttempts))

		testCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 30 * time.Second,
			Summary:             fmt.Sprintf("run_tests (iteration %d)", i+1),
			RetryPolicy:         retryPolicy,
		})
		var testResult string
		err = workflow.ExecuteActivity(testCtx, ExecuteTool, "pytest -x").Get(testCtx, &testResult)
		if err != nil {
			return "", err
		}

		workflow.SetCurrentDetails(ctx, fmt.Sprintf("**Iteration %d/%d:** Evaluating results", i+1, maxAttempts))

		evalCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 30 * time.Second,
			Summary:             fmt.Sprintf("evaluate (iteration %d)", i+1),
			RetryPolicy:         retryPolicy,
		})
		var evalResult string
		err = workflow.ExecuteActivity(evalCtx, CallLLM, "Evaluate test results, decide if done").Get(evalCtx, &evalResult)
		if err != nil {
			return "", err
		}

		if i == maxAttempts-1 {
			break
		}

		_ = workflow.NewTimerWithOptions(ctx, 2*time.Second, workflow.TimerOptions{
			Summary: fmt.Sprintf("recheck_delay: wait for CI (iteration %d)", i+1),
		}).Get(ctx, nil)
	}

	workflow.SetCurrentDetails(ctx, "Tests passing, generating commit message")

	commitCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "generate_commit_message",
		RetryPolicy:         retryPolicy,
	})
	var commitMsg string
	err := workflow.ExecuteActivity(commitCtx, CallLLM, "Generate commit message").Get(commitCtx, &commitMsg)
	if err != nil {
		return "", err
	}

	workflow.SetCurrentDetails(ctx, "Complete")
	return "Task complete: " + task, nil
}

func CodingAgentWithoutLabels(ctx workflow.Context, task string) (string, error) {
	maxAttempts := 3
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var result string

	for i := 0; i < maxAttempts; i++ {
		err := workflow.ExecuteActivity(ctx, CallLLM, "Plan code changes for: "+task).Get(ctx, &result)
		if err != nil {
			return "", err
		}

		err = workflow.ExecuteActivity(ctx, ExecuteTool, "edit main.py based on plan").Get(ctx, &result)
		if err != nil {
			return "", err
		}

		err = workflow.ExecuteActivity(ctx, ExecuteTool, "pytest -x").Get(ctx, &result)
		if err != nil {
			return "", err
		}

		err = workflow.ExecuteActivity(ctx, CallLLM, "Evaluate test results, decide if done").Get(ctx, &result)
		if err != nil {
			return "", err
		}

		if i == maxAttempts-1 {
			break
		}

		_ = workflow.NewTimer(ctx, 2*time.Second).Get(ctx, nil)
	}

	err := workflow.ExecuteActivity(ctx, CallLLM, "Generate commit message").Get(ctx, &result)
	if err != nil {
		return "", err
	}

	return "Task complete: " + task, nil
}

// --- Research Agent ---

func ResearchAgentWithLabels(ctx workflow.Context, query string) (string, error) {
	workflow.SetCurrentDetails(ctx, "**Step 1/4:** Planning research approach")

	planCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "agent_planner",
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	})
	var plan string
	err := workflow.ExecuteActivity(planCtx, CallLLM, "Plan research for: "+query).Get(planCtx, &plan)
	if err != nil {
		return "", err
	}

	workflow.SetCurrentDetails(ctx, "**Step 2/4:** Executing tool calls")

	toolCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "tool_call: web_search",
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	})
	var searchResult string
	err = workflow.ExecuteActivity(toolCtx, ExecuteTool, "web_search: "+query).Get(toolCtx, &searchResult)
	if err != nil {
		return "", err
	}

	toolCtx2 := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "tool_call: read_document",
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	})
	var docResult string
	err = workflow.ExecuteActivity(toolCtx2, ExecuteTool, "read_document: top result").Get(toolCtx2, &docResult)
	if err != nil {
		return "", err
	}

	workflow.SetCurrentDetails(ctx, "**Step 3/4:** Judging completeness")

	judgeCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "agent_judge",
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	})
	var judgment string
	err = workflow.ExecuteActivity(judgeCtx, CallLLM, "Judge if results are sufficient").Get(judgeCtx, &judgment)
	if err != nil {
		return "", err
	}

	_ = workflow.NewTimerWithOptions(ctx, 3*time.Second, workflow.TimerOptions{
		Summary: "scheduled_recheck: wait for source refresh",
	}).Get(ctx, nil)

	workflow.SetCurrentDetails(ctx, "**Step 4/4:** Synthesizing final answer")

	synthCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		Summary:             "agent_synthesizer",
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	})
	var answer string
	err = workflow.ExecuteActivity(synthCtx, CallLLM, "Synthesize answer from results").Get(synthCtx, &answer)
	if err != nil {
		return "", err
	}

	workflow.SetCurrentDetails(ctx, "Complete")
	return "Research complete: " + query, nil
}

func ResearchAgentWithoutLabels(ctx workflow.Context, query string) (string, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 2},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var result string

	err := workflow.ExecuteActivity(ctx, CallLLM, "Plan research for: "+query).Get(ctx, &result)
	if err != nil {
		return "", err
	}

	err = workflow.ExecuteActivity(ctx, ExecuteTool, "web_search: "+query).Get(ctx, &result)
	if err != nil {
		return "", err
	}

	err = workflow.ExecuteActivity(ctx, ExecuteTool, "read_document: top result").Get(ctx, &result)
	if err != nil {
		return "", err
	}

	err = workflow.ExecuteActivity(ctx, CallLLM, "Judge if results are sufficient").Get(ctx, &result)
	if err != nil {
		return "", err
	}

	_ = workflow.NewTimer(ctx, 3*time.Second).Get(ctx, nil)

	err = workflow.ExecuteActivity(ctx, CallLLM, "Synthesize answer from results").Get(ctx, &result)
	if err != nil {
		return "", err
	}

	return "Research complete: " + query, nil
}

// --- Shared activities ---

func CallLLM(_ context.Context, prompt string) (string, error) {
	time.Sleep(2 * time.Second)
	return "LLM response for: " + prompt, nil
}

func ExecuteTool(_ context.Context, toolCall string) (string, error) {
	time.Sleep(2 * time.Second)
	return "Tool result for: " + toolCall, nil
}

func main() {
	c, err := client.Dial(client.Options{})
	if err != nil {
		log.Fatalln("Unable to create client:", err)
	}
	defer c.Close()

	w := worker.New(c, taskQueue, worker.Options{})
	w.RegisterWorkflow(CodingAgentWithLabels)
	w.RegisterWorkflow(CodingAgentWithoutLabels)
	w.RegisterWorkflow(ResearchAgentWithLabels)
	w.RegisterWorkflow(ResearchAgentWithoutLabels)
	w.RegisterActivity(CallLLM)
	w.RegisterActivity(ExecuteTool)

	go func() {
		if err := w.Run(worker.InterruptCh()); err != nil {
			log.Fatalln("Unable to start worker:", err)
		}
	}()

	time.Sleep(1 * time.Second)

	// --- Coding Agent: without labels ---
	weCodingNo, err := c.ExecuteWorkflow(
		context.Background(),
		client.StartWorkflowOptions{
			ID:        "coding-agent-no-labels-v2",
			TaskQueue: taskQueue,
		},
		CodingAgentWithoutLabels,
		"Add input validation to the /users endpoint",
	)
	if err != nil {
		log.Fatalln("Unable to execute workflow:", err)
	}
	fmt.Printf("Started coding agent WITHOUT labels: %s\n", weCodingNo.GetID())

	// --- Coding Agent: with labels ---
	weCodingYes, err := c.ExecuteWorkflow(
		context.Background(),
		client.StartWorkflowOptions{
			ID:            "coding-agent-with-labels-v2",
			TaskQueue:     taskQueue,
			StaticSummary: "Coding agent: add input validation to /users",
			StaticDetails: "**Task:** Add input validation to the /users endpoint\n**Model:** Claude Sonnet\n**Max iterations:** 3",
		},
		CodingAgentWithLabels,
		"Add input validation to the /users endpoint",
	)
	if err != nil {
		log.Fatalln("Unable to execute workflow:", err)
	}
	fmt.Printf("Started coding agent WITH labels:    %s\n", weCodingYes.GetID())

	// --- Research Agent: without labels ---
	weResearchNo, err := c.ExecuteWorkflow(
		context.Background(),
		client.StartWorkflowOptions{
			ID:        "research-agent-no-labels-v3",
			TaskQueue: taskQueue,
		},
		ResearchAgentWithoutLabels,
		"What are the latest AI agent frameworks?",
	)
	if err != nil {
		log.Fatalln("Unable to execute workflow:", err)
	}
	fmt.Printf("Started research agent WITHOUT labels: %s\n", weResearchNo.GetID())

	// --- Research Agent: with labels ---
	weResearchYes, err := c.ExecuteWorkflow(
		context.Background(),
		client.StartWorkflowOptions{
			ID:            "research-agent-with-labels-v3",
			TaskQueue:     taskQueue,
			StaticSummary: "Research agent: latest AI agent frameworks",
			StaticDetails: "**Query:** What are the latest AI agent frameworks?\n**Model:** GPT-4o\n**Max iterations:** 1",
		},
		ResearchAgentWithLabels,
		"What are the latest AI agent frameworks?",
	)
	if err != nil {
		log.Fatalln("Unable to execute workflow:", err)
	}
	fmt.Printf("Started research agent WITH labels:    %s\n", weResearchYes.GetID())

	fmt.Println("\nOpen http://localhost:3000 to compare all workflows")

	var r string
	_ = weCodingNo.Get(context.Background(), &r)
	_ = weCodingYes.Get(context.Background(), &r)
	_ = weResearchNo.Get(context.Background(), &r)
	_ = weResearchYes.Get(context.Background(), &r)

	fmt.Println("All workflows completed.")
}
