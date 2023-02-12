const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Post = require('../models/Post')
const Follow = require('../models/Follow')

exports.doesUsernameExist = function(req, res) {
    User.findByUsername(req.body.username)
        .then(() => res.json(true))
        .catch(() => res.json(false))
}

exports.doesEmailExist = async function(req, res) {
    let emailBool = await User.doesEmailExist(req.body.email)
    res.json(emailBool)
}

exports.sharedProfileData = async function(req, res, next) {
    let isVisitorsProfile = false
    let isFollowing = false
    if (req.session.user) {
        isVisitorsProfile = req.profileUser._id.equals(req.session.user._id)
        isFollowing = await Follow.isVisitorFollowing(req.profileUser._id, req.visitorId)
    }

    req.isVisitorsProfile = isVisitorsProfile
    req.isFollowing = isFollowing
    // retrive post, follower and following counts
    let postCountPromise = Post.countPostsByAuthor(req.profileUser._id)
    let followerCountPromise = Follow.countFollowersById(req.profileUser._id)
    let followingCountPromise = Follow.countFollowingById(req.profileUser._id)
    let [postCount, followerCount, followingCount] = await Promise.all([postCountPromise, followerCountPromise, followingCountPromise])

    req.postCount = postCount
    req.followerCount = followerCount
    req.followingCount = followingCount

    next()
}

exports.mustBeLoggedIn = function(req, res, next) {
    if (req.session.user) {
        next()
    } else {
        req.flash("errors", "You must be logged in to perform that action")
        req.session.save(() => {
            res.redirect('/')
        })
    }
}

exports.login = async (req, res) => {
    let user = new User(req.body)
    try {
        await user.login()
        req.session.user = {username: user.data.username, _id: user.data._id, avatar: user.avatar}
        req.session.save(() => {
            res.redirect('/')
        })
    } catch (err) {
        req.flash('errors', err)
        req.session.save(() => {
            res.redirect('/')
        })
    }
}

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/')
    })
}

exports.register = (req, res) => {
    let user = new User(req.body)
    user.register().then(() => {
        req.session.user = {username: user.data.username, _id: user.data._id, avatar: user.avatar}
        req.session.save(function () {
            res.redirect('/')
        })
    }).catch((regErrors) => {
        regErrors.forEach((error) => {
            req.flash('regErrors', error)
        })
        req.session.save(function () {
            res.redirect('/')
        })
    })
}

exports.home = async (req, res) => {
    if (req.session.user) {
        // fetch feed of posts for current user
        const posts = await Post.getFeed(req.session.user._id)
        res.render('home-dashboard', {posts})
    } else {
        res.render('home-guest', {regErrors: req.flash('regErrors')})
    }
}

exports.ifUserExists = (req, res, next) => {
    User.findByUsername(req.params.username).then((userDocument) => {
        req.profileUser = userDocument
        next()
    }).catch(() => {
        res.render("404")
    })
}

exports.profilePostsScreen = (req, res) => {
    // ask our post model for posts by a centran author id
    Post.findByAuthorId(req.profileUser._id).then((posts) => {
        res.render('profile-posts', {
            title: `Profile of ${req.profileUser.username}`,
            currentPage: "posts",
            posts,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {
                postCount: req.postCount,
                followerCount: req.followerCount,
                followingCount: req.followingCount
            }
        })
    }).catch((e) => {
        console.error(e)
        res.render("404")
    })
}

exports.profileFollowersScreen = async function(req, res) {
    try {
        const followers = await Follow.getFollowersById(req.profileUser._id)
        res.render('profile-followers', {
            currentPage: "followers",
            followers,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {
                postsCount: req.postCount,
                followerCount: req.followerCount,
                followingCount: req.followingCount
            }
        })
    } catch {
        res.render("404")
    }
}

exports.profileFollowingScreen = async function(req, res) {
    try {
        const following = await Follow.getFollowingById(req.profileUser._id)
        res.render('profile-following', {
            currentPage: "following",
            following,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {
                postCount: req.postCount,
                followerCount: req.followerCount,
                followingCount: req.followingCount
            }
        })
    } catch {
        res.render("404")
    }
}

// API Actions

exports.apiMustBeLoggedIn = function(req, res, next) {
    try {
        req.apiUser = jwt.verify(req.body.token, process.env.JWT_SECRET)
        next()
    } catch {
        res.json("Provided token is invalid!")
    }
}

exports.apiLogin = async function(req, res) {
    const user = new User(req.body)
    try {
        await user.login()
        res.json(jwt.sign({_id: user.data._id}, process.env.JWT_SECRET, {expiresIn: '1d'}))
    } catch (err) {
        res.json("Sorry, your credentials are not correct!")
    }
}

exports.apiGetPostsByUsername = async function(req, res) {
    try {
        const authorDoc = await User.findByUsername(req.params.username)
        const posts = await Post.findByAuthorId(authorDoc._id)

        res.json(posts)
    } catch {
        res.json("Invalid user requested!")
    }
}