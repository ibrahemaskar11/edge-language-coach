import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTopics, useRecommendedTopics } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/topics/")({
  component: TopicsPage,
});

function TopicsPage() {
  const { data: topics, isLoading: topicsLoading } = useTopics();
  const { data: recommendedTopics, isLoading: recLoading } = useRecommendedTopics();
  const isLoading = topicsLoading || recLoading;
  const [isRecommended, setIsRecommended] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    if (!topics) return [];
    return [...new Set(topics.map((t) => t.category))].sort();
  }, [topics]);

  const filteredTopics = useMemo(() => {
    if (!topics) return [];

    if (isRecommended) {
      return recommendedTopics ?? [];
    }

    if (activeCategories.size === 0) {
      // Default: recommended first, then the rest
      if (!recommendedTopics || recommendedTopics.length === 0) return topics;
      const recIds = new Set(recommendedTopics.map((t) => t.id));
      const rest = topics.filter((t) => !recIds.has(t.id));
      return [...recommendedTopics, ...rest];
    }

    return topics.filter((t) => activeCategories.has(t.category));
  }, [topics, recommendedTopics, isRecommended, activeCategories]);

  function toggleCategory(cat: string) {
    setIsRecommended(false);
    const next = new Set(activeCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setActiveCategories(next);
  }

  function handleRecommendedClick() {
    setIsRecommended((prev) => !prev);
    setActiveCategories(new Set());
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

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {/* Recommended chip — always first */}
        <button
          onClick={handleRecommendedClick}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            isRecommended
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/50 text-muted-foreground hover:border-border"
          }`}
        >
          ✦ Recommended
        </button>

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
