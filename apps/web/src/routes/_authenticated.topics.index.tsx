import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTopics } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/topics/")({
  component: TopicsPage,
});

function TopicsPage() {
  const { data: topics, isLoading } = useTopics();
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    if (!topics) return [];
    return [...new Set(topics.map((t) => t.category))].sort();
  }, [topics]);

  // Empty set = no filter = show all
  const filteredTopics = useMemo(() => {
    if (!topics) return [];
    if (activeCategories.size === 0) return topics;
    return topics.filter((t) => activeCategories.has(t.category));
  }, [topics, activeCategories]);

  function toggleCategory(cat: string) {
    const next = new Set(activeCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setActiveCategories(next);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Topics</h1>
        <p className="mt-1 text-muted-foreground">Choose a topic to practice</p>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                activeCategories.has(cat)
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border/50 text-muted-foreground hover:border-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {!filteredTopics.length ? (
        <p className="text-sm text-muted-foreground">No topics match the selected filters.</p>
      ) : (
        <div className="space-y-3">
          {filteredTopics.map((topic) => (
            <Link key={topic.id} to="/topics/$topicId" params={{ topicId: topic.id }}>
              <Card className="border-border/50 transition-colors hover:bg-accent/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{topic.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {topic.level} &middot; {topic.category}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      View <ArrowRight className="inline h-3 w-3" />
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {topic.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
