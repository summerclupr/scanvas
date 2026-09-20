/**
 * The Careers tab: live internships, curated research programs, and the
 * documents you apply with.
 *
 * Data honesty carries over from the rest of the app, per card rather than
 * per screen because the sources mix: internships come live from the
 * SimplifyJobs community feed (real, no account needed); research programs
 * are a curated starter list and wear a "curated" chip with an instruction to
 * verify deadlines on the linked page.
 *
 * Faculty matched to your interests used to live here; they moved to the
 * For you tab, next to the talks and research events they relate to.
 */

import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Chip, Empty, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { FilesCard } from '@/components/files-card';
import { FitCard } from '@/components/fit-card';
import { PostingCard } from '@/components/posting-card';
import { relativeLabel } from '@/core/datetime';
import { FOLLOW_SUGGESTIONS } from '@/careers/types';
import { AssistantButton } from '@/components/assistant';
import { useApp } from '@/state/app-store';

type Filter = 'top' | 'internships' | 'research' | 'saved' | 'deadlines' | 'eligible';

export default function CareersScreen() {
  const c = useTheme();
  const {
    careers,
    careersFetchedAt,
    careersLoading,
    refreshCareers,
    savedPostings,
    togglePostingSaved,
    profile,
    updateProfile,
  } = useApp();

  const [filter, setFilter] = useState<Filter>('top');
  const [followDraft, setFollowDraft] = useState('');
  const [showAllFollows, setShowAllFollows] = useState(false);

  // Kick a TTL-gated refresh when the tab mounts.
  React.useEffect(() => {
    refreshCareers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedIds = useMemo(
    () => new Set(savedPostings.map((p) => p.id)),
    [savedPostings],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case 'internships':
        return careers.filter((p) => p.kind !== 'research');
      case 'research':
        return careers.filter((p) => p.kind === 'research');
      case 'saved':
        return careers.filter((p) => savedIds.has(p.id));
      case 'deadlines':
        return careers
          .filter((p) => p.deadline)
          .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
      case 'eligible':
        return careers.filter((p) => p.eligible).slice(0, 80);
      default: {
        // "Top": everything you follow or that matches, capped so 4,000 live
        // postings never become an unreadable wall.
        const interesting = careers.filter(
          (p) => p.eligible && (p.followed || p.score >= 0.3),
        );
        return (interesting.length ? interesting : careers.filter((p) => p.eligible))
          .slice(0, 60);
      }
    }
  }, [careers, filter, savedIds]);

  const toggleFollow = (name: string) => {
    const follows = profile.careerFollows.some(
      (f) => f.toLowerCase() === name.toLowerCase(),
    )
      ? profile.careerFollows.filter((f) => f.toLowerCase() !== name.toLowerCase())
      : [...profile.careerFollows, name];
    updateProfile({ careerFollows: follows });
  };

  const addFollow = () => {
    const v = followDraft.trim();
    if (!v) return;
    toggleFollow(v);
    setFollowDraft('');
  };

  const followChips = showAllFollows
    ? [...new Set([...profile.careerFollows, ...FOLLOW_SUGGESTIONS])]
    : [...new Set([...profile.careerFollows, ...FOLLOW_SUGGESTIONS])].slice(0, 9);

  const liveCount = careers.filter((p) => p.source === 'simplify').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={careersLoading}
            onRefresh={() => refreshCareers(true)}
            tintColor={c.accent}
          />
        }>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <T size={30} weight="700">Careers</T>
        <T size={14} tone="dim">
          {liveCount > 0
            ? `${liveCount.toLocaleString()} live internships + curated research programs`
            : careersLoading
              ? 'Fetching live internships...'
              : 'Curated research programs (pull down for live internships)'}
        </T>
        {careersFetchedAt ? (
          <T size={11} tone="faint">
            internships updated {relativeLabel(careersFetchedAt).replace('overdue by', '').trim()} ago
          </T>
        ) : null}

        <Card style={{ marginTop: 14 }}>
          <FilesCard />
        </Card>

        <SectionHeader
          title="Your fit"
          detail="Year, school, classes, and resume decide what surfaces."
        />
        <Card>
          <FitCard />
        </Card>

        {/* --- follows --- */}
        <SectionHeader
          title="Following"
          detail="Companies and labs you pick float to the top."
        />
        <Card>
          <Row gap={8} wrap={false} style={{ marginBottom: 10 }}>
            <TextInput
              value={followDraft}
              onChangeText={setFollowDraft}
              placeholder="Add a company or lab..."
              placeholderTextColor={c.textFaint}
              autoCapitalize="words"
              onSubmitEditing={addFollow}
              returnKeyType="done"
              style={{
                backgroundColor: c.cardAlt,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: c.text,
                fontSize: 15,
                flex: 1,
              }}
            />
            <Chip label="Add" tone="accent" onPress={addFollow} />
          </Row>
          <Row gap={8}>
            {followChips.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={profile.careerFollows.some(
                  (f) => f.toLowerCase() === name.toLowerCase(),
                )}
                onPress={() => toggleFollow(name)}
              />
            ))}
            <Chip
              label={showAllFollows ? 'less' : 'more...'}
              onPress={() => setShowAllFollows((v) => !v)}
            />
          </Row>
        </Card>

        {/* --- postings --- */}
        <SectionHeader title="Opportunities" />
        <Row gap={8} style={{ marginBottom: 10 }}>
          <Chip label="Top" selected={filter === 'top'} onPress={() => setFilter('top')} />
          <Chip
            label="Eligible only"
            selected={filter === 'eligible'}
            onPress={() => setFilter('eligible')}
          />
          <Chip
            label="Internships"
            selected={filter === 'internships'}
            onPress={() => setFilter('internships')}
          />
          <Chip
            label="Research"
            selected={filter === 'research'}
            onPress={() => setFilter('research')}
          />
          <Chip
            label="With deadlines"
            selected={filter === 'deadlines'}
            onPress={() => setFilter('deadlines')}
          />
          <Chip
            label={`Saved${savedPostings.length ? ` (${savedPostings.length})` : ''}`}
            selected={filter === 'saved'}
            onPress={() => setFilter('saved')}
          />
        </Row>

        {visible.length === 0 ? (
          <Empty
            title={filter === 'saved' ? 'Nothing saved yet' : 'Nothing here yet'}
            detail={
              filter === 'saved'
                ? 'Save a posting and, if it has a deadline, it lands on your Due list too.'
                : 'Pull down to fetch the live feed, or follow a company above.'
            }
          />
        ) : (
          visible.map((p) => (
            <PostingCard
              key={p.id}
              posting={p}
              saved={savedIds.has(p.id)}
              onSave={() => togglePostingSaved(p)}
            />
          ))
        )}

        {filter === 'top' && careers.length > visible.length ? (
          <T size={12} tone="faint" style={{ textAlign: 'center', marginTop: 8 }}>
            Showing the top {visible.length} of {careers.length.toLocaleString()} —
            follow companies or use the filters to see more.
          </T>
        ) : null}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}
