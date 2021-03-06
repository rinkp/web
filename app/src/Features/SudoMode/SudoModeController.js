/* eslint-disable
    max-len,
    no-unused-vars,
    no-use-before-define,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let SudoModeController
const OError = require('@overleaf/o-error')
const logger = require('logger-sharelatex')
const SudoModeHandler = require('./SudoModeHandler')
const AuthenticationController = require('../Authentication/AuthenticationController')
const { ObjectId } = require('mongodb')
const UserGetter = require('../User/UserGetter')
const Settings = require('settings-sharelatex')

module.exports = SudoModeController = {
  sudoModePrompt(req, res, next) {
    if (req.externalAuthenticationSystemUsed() && Settings.overleaf == null) {
      // TODO: maybe we should have audit logging on sudo mode, but if so, it
      // probably belongs in an internal database and not stackdriver
      logger.log({ userId }, '[SudoMode] using external auth, redirecting')
      return res.redirect('/project')
    }
    var userId = AuthenticationController.getLoggedInUserId(req)
    logger.log({ userId }, '[SudoMode] rendering sudo mode password page')
    return SudoModeHandler.isSudoModeActive(userId, function(err, isActive) {
      if (err != null) {
        OError.tag(err, '[SudoMode] error checking if sudo mode is active', {
          userId
        })
        return next(err)
      }
      if (isActive) {
        logger.log(
          { userId },
          '[SudoMode] sudo mode already active, redirecting'
        )
        return res.redirect('/project')
      }
      return res.render('sudo_mode/sudo_mode_prompt', {
        title: 'confirm_password_to_continue'
      })
    })
  },

  submitPassword(req, res, next) {
    const userId = AuthenticationController.getLoggedInUserId(req)
    const redir =
      AuthenticationController._getRedirectFromSession(req) || '/project'
    const { password } = req.body
    if (!password) {
      logger.log(
        { userId },
        '[SudoMode] no password supplied, failed authentication'
      )
      return next(new Error('no password supplied'))
    }
    logger.log({ userId, redir }, '[SudoMode] checking user password')
    return UserGetter.getUser(ObjectId(userId), { email: 1 }, function(
      err,
      userRecord
    ) {
      if (err != null) {
        OError.tag(err, '[SudoMode] error getting user', {
          userId
        })
        return next(err)
      }
      if (userRecord == null) {
        err = new OError('[SudoMode] user not found', { userId })
        return next(err)
      }
      return SudoModeHandler.authenticate(userRecord.email, password, function(
        err,
        user
      ) {
        if (err != null) {
          OError.tag(err, '[SudoMode] error authenticating user', {
            userId
          })
          return next(err)
        }
        if (user != null) {
          logger.log(
            { userId },
            '[SudoMode] authenticated user, activating sudo mode'
          )
          return SudoModeHandler.activateSudoMode(userId, function(err) {
            if (err != null) {
              OError.tag(err, '[SudoMode] error activating sudo mode', {
                userId
              })
              return next(err)
            }
            return res.json({
              redir
            })
          })
        } else {
          logger.log({ userId }, '[SudoMode] authentication failed for user')
          return res.json({
            message: {
              text: req.i18n.translate('invalid_password'),
              type: 'error'
            }
          })
        }
      })
    })
  }
}
