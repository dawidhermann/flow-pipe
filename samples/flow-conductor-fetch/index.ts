/**
 * Flow-Conductor Fetch Adapter Example
 *
 * This example demonstrates how to use flow-conductor with the fetch adapter
 * to create sequential HTTP request chains using the JSONPlaceholder API.
 *
 * Run: npm start
 */

import { begin } from "@flow-conductor/core";
import FetchRequestAdapter from "@flow-conductor/adapter-fetch";
import type { FetchRequestConfig } from "@flow-conductor/adapter-fetch";

// Create a fetch adapter instance
const adapter = new FetchRequestAdapter();

// Base URL for JSONPlaceholder API
const API_BASE = "https://jsonplaceholder.typicode.com";

// Type definitions for JSONPlaceholder API responses
interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

interface Comment {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  username: string;
}

interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
}

/**
 * Example 1: Simple GET request chain
 * Fetch a post, then fetch its comments
 */
async function example1_SimpleChain() {
  console.log("\n=== Example 1: Simple Chain ===");
  console.log("Fetching post #1 and its comments...\n");

  try {
    const result = await begin<Post, Response, FetchRequestConfig>(
      {
        config: {
          url: `${API_BASE}/posts/1`,
          method: "GET",
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Post;
        },
      },
      adapter
    )
      .next({
        config: (previousResult) => {
          const post = previousResult;
          if (!post) {
            throw new Error("No post found");
          }
          console.log(`Post: ${post.title}`);
          console.log(`Body: ${post.body.substring(0, 50)}...\n`);

          return {
            url: `${API_BASE}/posts/${post.id}/comments`,
            method: "GET",
          };
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Comment[];
        },
      })
      .execute();

    const comments = result;
    console.log(`Found ${comments.length} comments:`);
    comments.slice(0, 3).forEach((comment) => {
      console.log(`  - ${comment.name}: ${comment.body.substring(0, 40)}...`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example 2: Multi-step chain with data transformation
 * Fetch a user, then their posts, then their todos
 */
async function example2_MultiStepChain() {
  console.log("\n=== Example 2: Multi-Step Chain ===");
  console.log("Fetching user #1, their posts, and todos...\n");

  try {
    const result = await begin<User, Response, FetchRequestConfig>(
      {
        config: {
          url: `${API_BASE}/users/1`,
          method: "GET",
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as User;
        },
      },
      adapter
    )
      .next({
        config: (previousResult) => {
          const user = previousResult;
          if (!user) {
            throw new Error("No user found");
          }
          console.log(`User: ${user.name} (${user.email})`);

          return {
            url: `${API_BASE}/users/${user.id}/posts`,
            method: "GET",
          };
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Post[];
        },
      })
      .next({
        config: (previousResult) => {
          const posts = previousResult;
          if (!posts) {
            throw new Error("No posts found");
          }
          console.log(`\nPosts: ${posts.length} posts found`);

          // Get the user ID from the first post
          const userId = posts[0]?.userId;

          return {
            url: `${API_BASE}/users/${userId}/todos`,
            method: "GET",
          };
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Todo[];
        },
      })
      .execute();

    const todos = result;
    const completedTodos = todos.filter((todo) => todo.completed);
    console.log(
      `\nTodos: ${todos.length} total, ${completedTodos.length} completed`
    );
    console.log("\nFirst 3 todos:");
    todos.slice(0, 3).forEach((todo) => {
      console.log(`  ${todo.completed ? "✓" : "○"} ${todo.title}`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example 3: POST request chain
 * Create a new post, then fetch it back
 */
async function example3_PostRequest() {
  console.log("\n=== Example 3: POST Request Chain ===");
  console.log("Creating a new post and fetching it back...\n");

  try {
    const result = await begin<Post, Response, FetchRequestConfig>(
      {
        config: {
          url: `${API_BASE}/posts`,
          method: "POST",
          data: {
            title: "My New Post",
            body: "This is a test post created with flow-conductor",
            userId: 1,
          },
          headers: {
            "Content-Type": "application/json",
          },
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Post;
        },
      },
      adapter
    )
      .next({
        config: (previousResult) => {
          const newPost = previousResult;
          if (!newPost) {
            throw new Error("No new post found");
          }
          console.log(`Created post with ID: ${newPost.id}`);
          console.log(`Title: ${newPost.title}\n`);

          return {
            url: `${API_BASE}/posts/${newPost.id}`,
            method: "GET",
          };
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Post;
        },
      })
      .execute();

    const fetchedPost = result;
    console.log("Fetched post:");
    console.log(`  ID: ${fetchedPost.id}`);
    console.log(`  Title: ${fetchedPost.title}`);
    console.log(`  Body: ${fetchedPost.body}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example 4: Error handling
 * Demonstrates error handling in request chains
 */
async function example4_ErrorHandling() {
  console.log("\n=== Example 4: Error Handling ===");
  console.log("Attempting to fetch non-existent post...\n");

  try {
    await begin<Post, Response, FetchRequestConfig>(
      {
        config: {
          url: `${API_BASE}/posts/99999`,
          method: "GET",
        },
        mapper: async (result: Response) => {
          if (!result.ok) {
            throw new Error(`HTTP error! status: ${result.status}`);
          }
          const data = await result.json();
          return data as Post;
        },
      },
      adapter
    )
      .withErrorHandler((error) => {
        console.log("Error handler called!");
        if (error instanceof Error) {
          console.log(`Error message: ${error.message}`);
        } else {
          console.log(`Error: ${error}`);
        }
      })
      .execute();
  } catch (error) {
    if (error instanceof Error) {
      console.log("Caught error:", error.message);
    } else {
      console.log("Caught error:", error);
    }
  }
}

/**
 * Example 5: Conditional next step
 * Fetch posts and only fetch comments if posts exist
 */
async function example5_ConditionalChain() {
  console.log("\n=== Example 5: Conditional Chain ===");
  console.log("Fetching posts and conditionally fetching comments...\n");

  try {
    const result = await begin<Post[], Response, FetchRequestConfig>(
      {
        config: {
          url: `${API_BASE}/posts?userId=1`,
          method: "GET",
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Post[];
        },
      },
      adapter
    )
      .next({
        config: (previousResult) => {
          const posts = previousResult;
          if (!posts) {
            throw new Error("No posts found");
          }
          if (!Array.isArray(posts) || posts.length === 0) {
            throw new Error("No posts found");
          }
          const firstPost = posts[0];
          console.log(`Found ${posts.length} posts`);
          console.log(`Fetching comments for post #${firstPost.id}...\n`);

          return {
            url: `${API_BASE}/posts/${firstPost.id}/comments`,
            method: "GET",
          };
        },
        mapper: async (result: Response) => {
          const data = await result.json();
          return data as Comment[];
        },
      })
      .execute();

    const comments = result;
    console.log(`Found ${comments.length} comments for the first post`);
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log("🚀 Flow-Conductor Fetch Adapter Examples");
  console.log(
    "Using JSONPlaceholder API: https://jsonplaceholder.typicode.com"
  );
  console.log("=".repeat(60));

  await example1_SimpleChain();
  await example2_MultiStepChain();
  await example3_PostRequest();
  await example4_ErrorHandling();
  await example5_ConditionalChain();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All examples completed!");
}

// Run the examples
main().catch(console.error);
