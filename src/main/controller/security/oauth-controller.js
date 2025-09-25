const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const config = require('../../config/config');

if (config.oauth2Enabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/auth/google/callback',
      },
      function (accessToken, refreshToken, profile, cb) {
        // Here you would find or create a user in your database
        // For simplicity, we'll just return the profile
        return cb(null, profile);
      }
    )
  );

  passport.serializeUser(function (user, cb) {
    cb(null, user);
  });

  passport.deserializeUser(function (obj, cb) {
    cb(null, obj);
  });
}

const googleAuth = (req, res, next) => {
  if (!config.oauth2Enabled) {
    return res.status(400).json({ error: 'OAuth2 not enabled' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

const googleCallback = (req, res, next) => {
  if (!config.oauth2Enabled) {
    return res.status(400).json({ error: 'OAuth2 not enabled' });
  }
  passport.authenticate('google', { failureRedirect: '/login' }, (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.emails[0].value,
        name: user.displayName,
        provider: 'google',
      },
      process.env.JWT_SECRET || 'default-secret',
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      }
    );
    // Redirect to frontend with token
    res.redirect(`/?token=${token}`);
  })(req, res, next);
};

module.exports = {
  googleAuth,
  googleCallback,
};
