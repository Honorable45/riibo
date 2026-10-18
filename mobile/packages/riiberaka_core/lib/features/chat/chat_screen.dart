import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'chat.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({
    super.key,
    required this.conversationId,
    required this.title,
    this.readOnly = false,
  });

  final String conversationId;
  final String title;

  /// Conversation de commande terminée : relecture seule (règle serveur).
  final bool readOnly;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    ref.read(chatProvider(widget.conversationId).notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(chatProvider(widget.conversationId));
    final me = ref.watch(currentUserProvider)?.id;
    final p = context.palette;
    final state = async.value;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Expanded(
            child: state == null
                ? (async.hasError
                      ? ErrorState(
                          error: async.error!,
                          onRetry: () => ref.invalidate(
                            chatProvider(widget.conversationId),
                          ),
                        )
                      : const Center(child: CircularProgressIndicator()))
                : state.messages.isEmpty
                ? const EmptyState(
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'Aucun message',
                    message: 'Écrivez votre premier message.',
                  )
                : NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      if (n.metrics.extentAfter < 300) {
                        ref
                            .read(chatProvider(widget.conversationId).notifier)
                            .loadOlder();
                      }
                      return false;
                    },
                    child: ListView.builder(
                      reverse: true,
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.symmetric(
                        horizontal: RiiSpace.md,
                        vertical: RiiSpace.md,
                      ),
                      itemCount: state.messages.length,
                      itemBuilder: (context, index) {
                        final m =
                            state.messages[state.messages.length - 1 - index];
                        return _Bubble(
                          message: m,
                          mine: m.senderId == me,
                          onRetry: m.failed
                              ? () => ref
                                    .read(
                                      chatProvider(
                                        widget.conversationId,
                                      ).notifier,
                                    )
                                    .send(
                                      m.text ?? '',
                                      retryClientId: m.clientId,
                                    )
                              : null,
                        );
                      },
                    ),
                  ),
          ),
          if (widget.readOnly)
            Container(
              width: double.infinity,
              color: p.canvas,
              padding: const EdgeInsets.all(RiiSpace.lg),
              child: SafeArea(
                top: false,
                child: Text(
                  'Cette conversation est terminée. Pour toute question, contactez l’assistance.',
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall,
                ),
              ),
            )
          else
            DecoratedBox(
              decoration: BoxDecoration(
                color: p.surface,
                border: Border(top: BorderSide(color: p.line)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    RiiSpace.md,
                    RiiSpace.sm,
                    RiiSpace.xs,
                    RiiSpace.sm,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _input,
                          minLines: 1,
                          maxLines: 4,
                          textCapitalization: TextCapitalization.sentences,
                          inputFormatters: [
                            LengthLimitingTextInputFormatter(4000),
                          ],
                          decoration: const InputDecoration(
                            hintText: 'Votre message',
                            isDense: true,
                          ),
                          onSubmitted: (_) => _send(),
                        ),
                      ),
                      ListenableBuilder(
                        listenable: _input,
                        builder: (context, _) => IconButton(
                          tooltip: 'Envoyer',
                          onPressed: _input.text.trim().isEmpty ? null : _send,
                          icon: Icon(
                            Icons.send_rounded,
                            color: _input.text.trim().isEmpty
                                ? p.subtle
                                : p.brand,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine, this.onRetry});

  final ChatMessage message;
  final bool mine;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final time = DateFormat('HH:mm', 'fr').format(message.sentAt);
    if (message.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: RiiSpace.sm),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: RiiSpace.md,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              color: p.canvas,
              borderRadius: RiiRadius.pillAll,
            ),
            child: Text(
              '${message.displayText} · $time',
              style: t.bodySmall,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: const EdgeInsets.fromLTRB(
            RiiSpace.md,
            RiiSpace.sm,
            RiiSpace.md,
            6,
          ),
          decoration: BoxDecoration(
            color: mine ? p.brandSoft : p.surface,
            border: mine ? null : Border.all(color: p.line),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(RiiRadius.lg),
              topRight: const Radius.circular(RiiRadius.lg),
              bottomLeft: Radius.circular(mine ? RiiRadius.lg : 4),
              bottomRight: Radius.circular(mine ? 4 : RiiRadius.lg),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: SelectableText(message.displayText, style: t.bodyMedium),
              ),
              const SizedBox(height: 2),
              if (message.failed)
                InkWell(
                  onTap: onRetry,
                  child: Text(
                    'Non envoyé · Réessayer',
                    style: t.labelSmall!.copyWith(color: p.danger),
                  ),
                )
              else
                Text(message.pending ? 'Envoi…' : time, style: t.labelSmall),
            ],
          ),
        ),
      ),
    );
  }
}
